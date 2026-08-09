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
	liteLLMPriceCatalogURL             = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
	liteLLMPriceMaxBytes         int64 = 8 << 20
	liteLLMPriceCacheTTL               = 6 * time.Hour
	officialDiscountAvailable          = "available"
	officialDiscountUnavailable        = "unavailable"
	officialDiscountInconsistent       = "inconsistent"
)

type modelGroupDiscountRow struct {
	GroupID         int64      `xorm:"group_id"`
	ModelProviderID int64      `xorm:"model_provider_id"`
	Model           string     `xorm:"model"`
	BillingType     string     `xorm:"billing_type"`
	BillingConfig   model.JSON `xorm:"billing_config"`
}

var modelGroupOfficialPriceCache = newLiteLLMPriceCache(nil, "", nil)

type liteLLMTokenPrice struct {
	InputUSDPerToken         float64
	OutputUSDPerToken        float64
	CacheCreationUSDPerToken float64
	CacheReadUSDPerToken     float64
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
			Mode          string          `json:"mode"`
			Input         json.RawMessage `json:"input_cost_per_token"`
			Output        json.RawMessage `json:"output_cost_per_token"`
			CacheCreation json.RawMessage `json:"cache_creation_input_token_cost"`
			CacheRead     json.RawMessage `json:"cache_read_input_token_cost"`
		}
		if json.Unmarshal(raw, &entry) != nil || entry.Mode != "chat" {
			continue
		}
		input, inputOK := parsePositiveJSONNumber(entry.Input)
		output, outputOK := parsePositiveJSONNumber(entry.Output)
		cacheCreation, cacheCreationOK := parsePositiveJSONNumber(entry.CacheCreation)
		cacheRead, cacheReadOK := parsePositiveJSONNumber(entry.CacheRead)
		if !inputOK && !outputOK && !cacheCreationOK && !cacheReadOK {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		catalog.exact[key] = liteLLMTokenPrice{
			InputUSDPerToken:         input,
			OutputUSDPerToken:        output,
			CacheCreationUSDPerToken: cacheCreation,
			CacheReadUSDPerToken:     cacheRead,
		}
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

func calculateModelGroupOfficialDiscount(rows []modelGroupDiscountRow, catalog *liteLLMPriceCatalog, supplements supplementalOfficialPrices, exchangeRate float64) (*int64, string) {
	var discountBPS *int64
	for _, row := range rows {
		key := modelOfficialPriceKey{
			ModelProviderID: row.ModelProviderID,
			ModelName:       strings.TrimSpace(row.Model),
			BillingType:     row.BillingType,
		}
		supplement, supplementOK := supplements[key]
		if supplementOK && supplement.Currency == "USD" && !validUSDCNYExchangeRate(exchangeRate) {
			supplementOK = false
		}
		var litePrice liteLLMTokenPrice
		litePriceOK := false
		if row.BillingType == "token" && catalog != nil && validUSDCNYExchangeRate(exchangeRate) {
			litePrice, litePriceOK = catalog.match(row.Model)
		}
		for _, dimension := range officialDiscountDimensions(row.BillingType) {
			sellingCredits, sellingOK := officialPriceConfigValue(row.BillingConfig, dimension)
			if !sellingOK {
				continue
			}
			officialCredits, officialOK := float64(0), false
			if litePriceOK {
				officialCredits, officialOK = liteLLMTokenOfficialCredits(litePrice, dimension, exchangeRate)
			}
			if !officialOK && supplementOK {
				officialCredits, officialOK = officialPriceConfigValue(supplement.NormalizedPriceConfig, dimension)
			}
			if !officialOK {
				continue
			}
			roundedValue := math.Round((sellingCredits/officialCredits*10_000)/10) * 10
			if math.IsNaN(roundedValue) || math.IsInf(roundedValue, 0) || roundedValue > math.MaxInt64 {
				continue
			}
			rounded := int64(roundedValue)
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

func officialDiscountDimensions(billingType string) []string {
	switch billingType {
	case "token":
		return []string{
			"input_price_per_1m_tokens",
			"output_price_per_1m_tokens",
			"cache_creation_price_per_1m_tokens",
			"cache_read_price_per_1m_tokens",
		}
	case "image":
		return []string{"base_price", "default_size_price", "size_prices.1k", "size_prices.2k", "size_prices.3k", "size_prices.4k"}
	case "video", "audio":
		return []string{"price_per_second"}
	case "count":
		return []string{"price_per_call"}
	default:
		return nil
	}
}

func officialPriceConfigValue(config model.JSON, dimension string) (float64, bool) {
	value := interface{}(nil)
	if strings.HasPrefix(dimension, "size_prices.") {
		sizes, ok := config["size_prices"].(map[string]interface{})
		if !ok {
			if typed, typedOK := config["size_prices"].(model.JSON); typedOK {
				sizes = map[string]interface{}(typed)
			} else {
				return 0, false
			}
		}
		value = sizes[strings.TrimPrefix(dimension, "size_prices.")]
	} else {
		value = config[dimension]
	}
	parsed, ok := toFloat64(value)
	if !ok || parsed <= 0 || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return 0, false
	}
	return parsed, true
}

func liteLLMTokenOfficialCredits(price liteLLMTokenPrice, dimension string, exchangeRate float64) (float64, bool) {
	usdPerToken := float64(0)
	switch dimension {
	case "input_price_per_1m_tokens":
		usdPerToken = price.InputUSDPerToken
	case "output_price_per_1m_tokens":
		usdPerToken = price.OutputUSDPerToken
	case "cache_creation_price_per_1m_tokens":
		usdPerToken = price.CacheCreationUSDPerToken
	case "cache_read_price_per_1m_tokens":
		usdPerToken = price.CacheReadUSDPerToken
	}
	credits := math.Round(usdPerToken * exchangeRate * 1_000_000_000_000)
	if usdPerToken <= 0 || credits <= 0 || math.IsNaN(credits) || math.IsInf(credits, 0) || credits > math.MaxInt64 {
		return 0, false
	}
	return credits, true
}

func validUSDCNYExchangeRate(exchangeRate float64) bool {
	return exchangeRate > 0 && !math.IsNaN(exchangeRate) && !math.IsInf(exchangeRate, 0)
}

func applyModelGroupOfficialDiscounts(groups []ModelGroupSummary, rows []modelGroupDiscountRow, catalog *liteLLMPriceCatalog, supplements supplementalOfficialPrices, exchangeRate float64) {
	rowsByGroup := make(map[int64][]modelGroupDiscountRow)
	for _, row := range rows {
		rowsByGroup[row.GroupID] = append(rowsByGroup[row.GroupID], row)
	}
	for index := range groups {
		groups[index].OfficialDiscountBPS, groups[index].OfficialDiscountStatus = calculateModelGroupOfficialDiscount(rowsByGroup[groups[index].ID], catalog, supplements, exchangeRate)
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
		catalog = nil
	}

	groupIDs := make([]int64, len(groups))
	for index := range groups {
		groupIDs[index] = groups[index].ID
	}
	var rows []modelGroupDiscountRow
	if err := db.Engine.Context(ctx).Table("model_group_models").Alias("mgm").
		Select("mgm.group_id AS group_id, c.model_provider_id AS model_provider_id, c.model AS model, c.billing_type AS billing_type, c.billing_config AS billing_config").
		Join("INNER", "channels c", "c.id = mgm.channel_id").
		In("mgm.group_id", groupIDs).Find(&rows); err != nil {
		return err
	}
	providerSet := make(map[int64]struct{})
	for _, row := range rows {
		if row.ModelProviderID > 0 {
			providerSet[row.ModelProviderID] = struct{}{}
		}
	}
	providerIDs := make([]int64, 0, len(providerSet))
	for providerID := range providerSet {
		providerIDs = append(providerIDs, providerID)
	}
	supplements, err := loadActiveSupplementalOfficialPrices(ctx, providerIDs)
	if err != nil {
		return err
	}
	applyModelGroupOfficialDiscounts(groups, rows, catalog, supplements, exchangeRate)
	return nil
}

func loadUSDCNYExchangeRate(ctx context.Context) (float64, error) {
	keys := []string{
		USDCNYExchangeRateSettingKey,
		USDCNYExchangeRateSourceSettingKey,
		USDCNYExchangeRateDateSettingKey,
		USDCNYExchangeRateSyncedAtSettingKey,
	}
	var rows []model.SystemSetting
	err := db.Engine.Context(ctx).In("key", keys).Find(&rows)
	if err != nil {
		return 0, err
	}
	settings := make(map[string]string, len(rows))
	for _, row := range rows {
		settings[row.Key] = row.Value
	}
	rate, _ := parseAutomaticUSDCNYExchangeRate(settings)
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
