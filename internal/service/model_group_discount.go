package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	USDCNYExchangeRateSettingKey       = "usd_cny_exchange_rate"
	DefaultUSDCNYExchangeRate          = 7.20
	liteLLMPriceCatalogURL             = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
	liteLLMPriceMaxBytes         int64 = 8 << 20
	liteLLMPriceCacheTTL               = 6 * time.Hour
)

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
