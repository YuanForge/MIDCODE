package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"
)

const (
	USDCNYExchangeRateSettingKey       = "usd_cny_exchange_rate"
	DefaultUSDCNYExchangeRate          = 7.20
	liteLLMPriceCatalogURL             = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
	liteLLMPriceMaxBytes         int64 = 8 << 20
	liteLLMPriceCacheTTL               = 6 * time.Hour
	officialDiscountAvailable          = "available"
	officialDiscountUnavailable        = "unavailable"
	officialDiscountInconsistent       = "inconsistent"
)

type modelGroupDiscountRow struct {
	GroupID       int64      `xorm:"group_id"`
	Model         string     `xorm:"model"`
	BillingType   string     `xorm:"billing_type"`
	BillingConfig model.JSON `xorm:"billing_config"`
}

var modelGroupOfficialPriceCache = newLiteLLMPriceCache(nil, "", nil)

type liteLLMTokenPrice struct {
	InputUSDPerToken  float64
	OutputUSDPerToken float64
}

type liteLLMPriceCatalog struct {
	exact   map[string]liteLLMTokenPrice
	byModel map[string][]string
}

func (c *liteLLMPriceCatalog) match(modelName string) (liteLLMTokenPrice, bool) {
	modelName = strings.TrimSpace(modelName)
	if price, ok := c.exact[modelName]; ok {
		return price, true
	}
	keys := c.byModel[modelName]
	if len(keys) != 1 {
		return liteLLMTokenPrice{}, false
	}
	price, ok := c.exact[keys[0]]
	return price, ok
}

func parseLiteLLMTokenPrices(r io.Reader, maxBytes int64) (*liteLLMPriceCatalog, error) {
	body, err := io.ReadAll(io.LimitReader(r, maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read LiteLLM price catalog: %w", err)
	}
	if int64(len(body)) > maxBytes {
		return nil, fmt.Errorf("LiteLLM price catalog exceeds %d bytes", maxBytes)
	}

	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var entries map[string]json.RawMessage
	if err := decoder.Decode(&entries); err != nil {
		return nil, fmt.Errorf("decode LiteLLM price catalog: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, fmt.Errorf("decode LiteLLM price catalog: trailing data")
	}

	catalog := &liteLLMPriceCatalog{
		exact:   make(map[string]liteLLMTokenPrice),
		byModel: make(map[string][]string),
	}
	for key, raw := range entries {
		var entry struct {
			Mode   string          `json:"mode"`
			Input  json.RawMessage `json:"input_cost_per_token"`
			Output json.RawMessage `json:"output_cost_per_token"`
		}
		if json.Unmarshal(raw, &entry) != nil || entry.Mode != "chat" {
			continue
		}
		input, inputOK := parsePositiveJSONNumber(entry.Input)
		output, outputOK := parsePositiveJSONNumber(entry.Output)
		if !inputOK && !outputOK {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		catalog.exact[key] = liteLLMTokenPrice{InputUSDPerToken: input, OutputUSDPerToken: output}
	}
	if len(catalog.exact) == 0 {
		return nil, fmt.Errorf("LiteLLM price catalog contains no usable chat token prices")
	}
	for key := range catalog.exact {
		segment := key
		if index := strings.LastIndexByte(key, '/'); index >= 0 {
			segment = key[index+1:]
		}
		catalog.byModel[segment] = append(catalog.byModel[segment], key)
	}
	return catalog, nil
}

func parsePositiveJSONNumber(raw json.RawMessage) (float64, bool) {
	value, err := strconv.ParseFloat(string(raw), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
		return 0, false
	}
	return value, true
}

type liteLLMPriceCache struct {
	mu        sync.Mutex
	client    *http.Client
	url       string
	now       func() time.Time
	catalog   *liteLLMPriceCatalog
	fetchedAt time.Time
}

func newLiteLLMPriceCache(client *http.Client, url string, now func() time.Time) *liteLLMPriceCache {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	if url == "" {
		url = liteLLMPriceCatalogURL
	}
	if now == nil {
		now = time.Now
	}
	return &liteLLMPriceCache{client: client, url: url, now: now}
}

func (c *liteLLMPriceCache) Load(ctx context.Context) (*liteLLMPriceCatalog, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	if c.catalog != nil && now.Before(c.fetchedAt.Add(liteLLMPriceCacheTTL)) {
		return c.catalog, nil
	}
	catalog, err := c.fetch(ctx)
	if err != nil {
		if c.catalog != nil {
			return c.catalog, nil
		}
		return nil, err
	}
	c.catalog = catalog
	c.fetchedAt = now
	return catalog, nil
}

func (c *liteLLMPriceCache) fetch(ctx context.Context) (*liteLLMPriceCatalog, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return nil, fmt.Errorf("create LiteLLM price request: %w", err)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch LiteLLM price catalog: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("fetch LiteLLM price catalog: HTTP %d", resp.StatusCode)
	}
	return parseLiteLLMTokenPrices(resp.Body, liteLLMPriceMaxBytes)
}

func calculateModelGroupOfficialDiscount(rows []modelGroupDiscountRow, catalog *liteLLMPriceCatalog, exchangeRate float64) (*int64, string) {
	if catalog == nil || exchangeRate <= 0 || math.IsNaN(exchangeRate) || math.IsInf(exchangeRate, 0) {
		return nil, officialDiscountUnavailable
	}
	var discountBPS *int64
	for _, row := range rows {
		if row.BillingType != "token" {
			continue
		}
		price, ok := catalog.match(row.Model)
		if !ok {
			continue
		}
		dimensions := [...]struct {
			sellingCredits float64
			officialUSD    float64
		}{
			{mapFloat64(row.BillingConfig, "input_price_per_1m_tokens"), price.InputUSDPerToken},
			{mapFloat64(row.BillingConfig, "output_price_per_1m_tokens"), price.OutputUSDPerToken},
		}
		for _, dimension := range dimensions {
			if dimension.sellingCredits <= 0 || math.IsNaN(dimension.sellingCredits) || math.IsInf(dimension.sellingCredits, 0) || dimension.officialUSD <= 0 {
				continue
			}
			officialCNYPerMillion := dimension.officialUSD * 1_000_000 * exchangeRate
			sellingCNYPerMillion := dimension.sellingCredits / 1_000_000
			rounded := int64(math.Round((sellingCNYPerMillion/officialCNYPerMillion*10_000)/10) * 10)
			if discountBPS == nil {
				discountBPS = &rounded
				continue
			}
			if *discountBPS != rounded {
				return nil, officialDiscountInconsistent
			}
		}
	}
	if discountBPS == nil {
		return nil, officialDiscountUnavailable
	}
	return discountBPS, officialDiscountAvailable
}

func applyModelGroupOfficialDiscounts(groups []ModelGroupSummary, rows []modelGroupDiscountRow, catalog *liteLLMPriceCatalog, exchangeRate float64) {
	rowsByGroup := make(map[int64][]modelGroupDiscountRow)
	for _, row := range rows {
		rowsByGroup[row.GroupID] = append(rowsByGroup[row.GroupID], row)
	}
	for index := range groups {
		groups[index].OfficialDiscountBPS, groups[index].OfficialDiscountStatus = calculateModelGroupOfficialDiscount(rowsByGroup[groups[index].ID], catalog, exchangeRate)
	}
}

func enrichModelGroupOfficialDiscounts(ctx context.Context, groups []ModelGroupSummary) error {
	if len(groups) == 0 {
		return nil
	}
	exchangeRate, err := loadUSDCNYExchangeRate(ctx)
	if err != nil {
		return err
	}
	catalog, err := modelGroupOfficialPriceCache.Load(ctx)
	if err != nil {
		log.Printf("[model-group-discount] LiteLLM price catalog unavailable: %v", err)
		applyModelGroupOfficialDiscounts(groups, nil, nil, exchangeRate)
		return nil
	}

	groupIDs := make([]int64, len(groups))
	for index := range groups {
		groupIDs[index] = groups[index].ID
	}
	var rows []modelGroupDiscountRow
	if err := db.Engine.Context(ctx).Table("model_group_models").Alias("mgm").
		Select("mgm.group_id AS group_id, c.model AS model, c.billing_type AS billing_type, c.billing_config AS billing_config").
		Join("INNER", "channels c", "c.id = mgm.channel_id").
		In("mgm.group_id", groupIDs).Find(&rows); err != nil {
		return err
	}
	applyModelGroupOfficialDiscounts(groups, rows, catalog, exchangeRate)
	return nil
}

func loadUSDCNYExchangeRate(ctx context.Context) (float64, error) {
	var setting model.SystemSetting
	found, err := db.Engine.Context(ctx).Where("key = ?", USDCNYExchangeRateSettingKey).Get(&setting)
	if err != nil {
		return 0, err
	}
	if !found || strings.TrimSpace(setting.Value) == "" {
		return DefaultUSDCNYExchangeRate, nil
	}
	rate, err := ParseUSDCNYExchangeRate(setting.Value)
	if err != nil {
		log.Printf("[model-group-discount] invalid stored USD/CNY exchange rate %q; using %.2f", setting.Value, DefaultUSDCNYExchangeRate)
		return DefaultUSDCNYExchangeRate, nil
	}
	return rate, nil
}

func ParseUSDCNYExchangeRate(value string) (float64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, fmt.Errorf("USD/CNY exchange rate must be a positive number")
	}
	rate, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(rate) || math.IsInf(rate, 0) || rate <= 0 {
		return 0, fmt.Errorf("USD/CNY exchange rate must be a finite positive number")
	}
	return rate, nil
}

func USDCNYExchangeRateOrDefault(value string) float64 {
	rate, err := ParseUSDCNYExchangeRate(value)
	if err != nil {
		return DefaultUSDCNYExchangeRate
	}
	return rate
}
