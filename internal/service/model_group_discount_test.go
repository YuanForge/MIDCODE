package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"fanapi/internal/model"
)

func TestParseUSDCNYExchangeRate(t *testing.T) {
	got, err := ParseUSDCNYExchangeRate("7.20")
	if err != nil {
		t.Fatalf("ParseUSDCNYExchangeRate returned error: %v", err)
	}
	if got != 7.2 {
		t.Fatalf("ParseUSDCNYExchangeRate = %v, want 7.2", got)
	}
	trimmed, err := ParseUSDCNYExchangeRate(" 7.20 ")
	if err != nil {
		t.Fatalf("ParseUSDCNYExchangeRate with surrounding whitespace returned error: %v", err)
	}
	if trimmed != 7.2 {
		t.Fatalf("ParseUSDCNYExchangeRate with surrounding whitespace = %v, want 7.2", trimmed)
	}

	for _, value := range []string{"0", "-1", "NaN", "Inf", "", " ", "not-a-number"} {
		if _, err := ParseUSDCNYExchangeRate(value); err == nil {
			t.Errorf("ParseUSDCNYExchangeRate(%q) returned nil error", value)
		}
	}
}

func TestLiteLLMTokenPricesAndModelMatch(t *testing.T) {
	fixture := `{
		"provider/model-a":{"mode":"chat","input_cost_per_token":0.00001,"output_cost_per_token":0.00002,"cache_creation_input_token_cost":0.0000125,"cache_read_input_token_cost":0.000001},
		"other/model-a":{"mode":"chat","input_cost_per_token":0.00003,"output_cost_per_token":0.00004},
		"unique/model-b":{"mode":"chat","input_cost_per_token":0.00005,"output_cost_per_token":0.00006},
		"image/model-c":{"mode":"image_generation","input_cost_per_token":0.1,"output_cost_per_token":0.2},
		"bad/model-d":{"mode":"chat","input_cost_per_token":0,"output_cost_per_token":-1}
	}`
	catalog, err := parseLiteLLMTokenPrices(strings.NewReader(fixture), 1024)
	if err != nil {
		t.Fatalf("parseLiteLLMTokenPrices returned error: %v", err)
	}

	exact, ok := catalog.match(" provider/model-a ")
	if !ok || exact.InputUSDPerToken != 0.00001 || exact.OutputUSDPerToken != 0.00002 || exact.CacheCreationUSDPerToken != 0.0000125 || exact.CacheReadUSDPerToken != 0.000001 {
		t.Fatalf("exact match = %#v, %v", exact, ok)
	}
	if _, ok := catalog.match("model-a"); ok {
		t.Fatal("ambiguous final segment unexpectedly matched")
	}
	unique, ok := catalog.match("model-b")
	if !ok || unique.InputUSDPerToken != 0.00005 {
		t.Fatalf("unique final-segment match = %#v, %v", unique, ok)
	}
	for _, model := range []string{"model-c", "model-d", "missing"} {
		if _, ok := catalog.match(model); ok {
			t.Fatalf("invalid model %q unexpectedly matched", model)
		}
	}
}

func TestLiteLLMTokenPricesRejectMalformedAndOversizedBodies(t *testing.T) {
	if _, err := parseLiteLLMTokenPrices(strings.NewReader(`{"broken":`), 1024); err == nil {
		t.Fatal("malformed JSON returned nil error")
	}
	if _, err := parseLiteLLMTokenPrices(strings.NewReader(`{"model":{"mode":"chat","input_cost_per_token":1,"output_cost_per_token":1}}`), 16); err == nil {
		t.Fatal("oversized body returned nil error")
	}
}

func TestLiteLLMPriceCache(t *testing.T) {
	const fixture = `{"provider/model":{"mode":"chat","input_cost_per_token":0.00001,"output_cost_per_token":0.00002}}`
	var requests atomic.Int32
	var fail atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		if fail.Load() {
			http.Error(w, "temporary failure", http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(fixture))
	}))
	defer server.Close()

	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	cache := newLiteLLMPriceCache(server.Client(), server.URL, func() time.Time { return now })
	if _, err := cache.Load(context.Background()); err != nil {
		t.Fatalf("first load returned error: %v", err)
	}
	if _, err := cache.Load(context.Background()); err != nil {
		t.Fatalf("cached load returned error: %v", err)
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("requests within six hours = %d, want 1", got)
	}

	now = now.Add(liteLLMPriceCacheTTL + time.Second)
	fail.Store(true)
	stale, err := cache.Load(context.Background())
	if err != nil || stale == nil {
		t.Fatalf("failed refresh did not preserve stale catalog: catalog=%v err=%v", stale, err)
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("requests after expired refresh = %d, want 2", got)
	}
}

func TestLiteLLMPriceCacheConcurrentColdLoadAndFirstFailure(t *testing.T) {
	const fixture = `{"provider/model":{"mode":"chat","input_cost_per_token":0.00001,"output_cost_per_token":0.00002}}`
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_, _ = w.Write([]byte(fixture))
	}))
	defer server.Close()

	cache := newLiteLLMPriceCache(server.Client(), server.URL, time.Now)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := cache.Load(context.Background())
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent load returned error: %v", err)
		}
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("concurrent cold requests = %d, want 1", got)
	}

	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no catalog", http.StatusServiceUnavailable)
	}))
	defer failing.Close()
	failedCache := newLiteLLMPriceCache(failing.Client(), failing.URL, time.Now)
	if catalog, err := failedCache.Load(context.Background()); err == nil || catalog != nil {
		t.Fatalf("first failed fetch = catalog %v, err %v", catalog, err)
	}
}

func TestCalculateModelGroupOfficialDiscountUsesLiteLLMThenSupplement(t *testing.T) {
	row := modelGroupDiscountRow{
		ModelProviderID: 1,
		Model:           "model-a",
		BillingType:     "token",
		BillingConfig: model.JSON{
			"input_price_per_1m_tokens":      int64(13_500_000),
			"output_price_per_1m_tokens":     int64(27_000_000),
			"cache_read_price_per_1m_tokens": int64(1_350_000),
		},
	}
	catalog := &liteLLMPriceCatalog{
		exact:   map[string]liteLLMTokenPrice{"model-a": {InputUSDPerToken: 0.000002, OutputUSDPerToken: 0.000004}},
		byModel: map[string][]string{"model-a": {"model-a"}},
	}
	extra := buildSupplementalOfficialPrices([]model.ModelOfficialPrice{{
		ModelProviderID: 1, ModelName: "model-a", BillingType: "token", Currency: "CNY", IsActive: true,
		NormalizedPriceConfig: model.JSON{"cache_read_price_per_1m_tokens": int64(1_350_000)},
	}})
	bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, catalog, extra, 6.75)
	if status != officialDiscountAvailable || bps == nil || *bps != 10_000 {
		t.Fatalf("bps=%v status=%s", bps, status)
	}
}

func TestCalculateModelGroupOfficialDiscountLiteLLMCacheWinsSupplement(t *testing.T) {
	row := modelGroupDiscountRow{
		ModelProviderID: 1, Model: "model-a", BillingType: "token",
		BillingConfig: model.JSON{"cache_read_price_per_1m_tokens": int64(13_500_000)},
	}
	catalog := &liteLLMPriceCatalog{
		exact:   map[string]liteLLMTokenPrice{"model-a": {CacheReadUSDPerToken: 0.000001}},
		byModel: map[string][]string{"model-a": {"model-a"}},
	}
	extra := supplementalPricesForTest(1, "model-a", "token", "CNY", model.JSON{
		"cache_read_price_per_1m_tokens": int64(13_500_000),
	})
	bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, catalog, extra, 6.75)
	if status != officialDiscountAvailable || bps == nil || *bps != 20_000 {
		t.Fatalf("bps=%v status=%s, want LiteLLM-derived 20000", bps, status)
	}
}

func TestCalculateModelGroupOfficialDiscountUsesCNYSupplementWithoutRate(t *testing.T) {
	row := modelGroupDiscountRow{
		ModelProviderID: 1, Model: "domestic-model", BillingType: "count",
		BillingConfig: model.JSON{"price_per_call": int64(2_000_000)},
	}
	extra := supplementalPricesForTest(1, "domestic-model", "count", "CNY", model.JSON{"price_per_call": int64(2_000_000)})
	bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, nil, extra, 0)
	if status != officialDiscountAvailable || bps == nil || *bps != 10_000 {
		t.Fatalf("bps=%v status=%s", bps, status)
	}

	usd := supplementalPricesForTest(1, "domestic-model", "count", "USD", model.JSON{"price_per_call": int64(2_000_000)})
	if bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, nil, usd, 0); status != officialDiscountUnavailable || bps != nil {
		t.Fatalf("USD without rate = %v, %s", bps, status)
	}
}

func TestSupplementalOfficialPriceMatchingIsExact(t *testing.T) {
	row := modelGroupDiscountRow{
		ModelProviderID: 1, Model: "provider/model-a", BillingType: "count",
		BillingConfig: model.JSON{"price_per_call": int64(1_000_000)},
	}
	invalidRows := []model.ModelOfficialPrice{
		{ModelProviderID: 1, ModelName: "provider/model-a", BillingType: "count", Currency: "CNY", IsActive: false, NormalizedPriceConfig: model.JSON{"price_per_call": int64(1_000_000)}},
		{ModelProviderID: 2, ModelName: "provider/model-a", BillingType: "count", Currency: "CNY", IsActive: true, NormalizedPriceConfig: model.JSON{"price_per_call": int64(1_000_000)}},
		{ModelProviderID: 1, ModelName: "model-a", BillingType: "count", Currency: "CNY", IsActive: true, NormalizedPriceConfig: model.JSON{"price_per_call": int64(1_000_000)}},
		{ModelProviderID: 1, ModelName: "provider/model-a", BillingType: "video", Currency: "CNY", IsActive: true, NormalizedPriceConfig: model.JSON{"price_per_second": int64(1_000_000)}},
	}
	invalid := buildSupplementalOfficialPrices(invalidRows)
	if bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, nil, invalid, 0); status != officialDiscountUnavailable || bps != nil {
		t.Fatalf("inexact supplement matched: %v, %s", bps, status)
	}
	exact := supplementalPricesForTest(1, "provider/model-a", "count", "CNY", model.JSON{"price_per_call": int64(1_000_000)})
	row.Model = " provider/model-a "
	if bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, nil, exact, 0); status != officialDiscountAvailable || bps == nil || *bps != 10_000 {
		t.Fatalf("trimmed exact supplement = %v, %s", bps, status)
	}
}

func TestCalculateModelGroupOfficialDiscountNonTokenDimensions(t *testing.T) {
	tests := []struct {
		name     string
		billing  string
		selling  model.JSON
		official model.JSON
	}{
		{name: "image tier", billing: "image", selling: model.JSON{"size_prices": map[string]interface{}{"2k": int64(2_000_000)}}, official: model.JSON{"size_prices": map[string]interface{}{"2k": int64(2_000_000)}}},
		{name: "video second", billing: "video", selling: model.JSON{"price_per_second": int64(3_000_000)}, official: model.JSON{"price_per_second": int64(3_000_000)}},
		{name: "audio second", billing: "audio", selling: model.JSON{"price_per_second": int64(4_000_000)}, official: model.JSON{"price_per_second": int64(4_000_000)}},
		{name: "count call", billing: "count", selling: model.JSON{"price_per_call": int64(5_000_000)}, official: model.JSON{"price_per_call": int64(5_000_000)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			row := modelGroupDiscountRow{ModelProviderID: 1, Model: "model", BillingType: tt.billing, BillingConfig: tt.selling}
			extra := supplementalPricesForTest(1, "model", tt.billing, "CNY", tt.official)
			bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, nil, extra, 0)
			if status != officialDiscountAvailable || bps == nil || *bps != 10_000 {
				t.Fatalf("bps=%v status=%s", bps, status)
			}
		})
	}
}

func TestCalculateModelGroupOfficialDiscountSupplementalInconsistentAndColdStart(t *testing.T) {
	rows := []modelGroupDiscountRow{
		{ModelProviderID: 1, Model: "a", BillingType: "count", BillingConfig: model.JSON{"price_per_call": int64(1_000_000)}},
		{ModelProviderID: 1, Model: "b", BillingType: "count", BillingConfig: model.JSON{"price_per_call": int64(2_000_000)}},
	}
	extra := buildSupplementalOfficialPrices([]model.ModelOfficialPrice{
		{ModelProviderID: 1, ModelName: "a", BillingType: "count", Currency: "CNY", IsActive: true, NormalizedPriceConfig: model.JSON{"price_per_call": int64(1_000_000)}},
		{ModelProviderID: 1, ModelName: "b", BillingType: "count", Currency: "CNY", IsActive: true, NormalizedPriceConfig: model.JSON{"price_per_call": int64(1_000_000)}},
	})
	if bps, status := calculateModelGroupOfficialDiscount(rows, nil, extra, 0); status != officialDiscountInconsistent || bps != nil {
		t.Fatalf("inconsistent supplements = %v, %s", bps, status)
	}

	tokenRow := modelGroupDiscountRow{
		ModelProviderID: 1, Model: "cold", BillingType: "token",
		BillingConfig: model.JSON{"input_price_per_1m_tokens": int64(9_000_000)},
	}
	tokenExtra := supplementalPricesForTest(1, "cold", "token", "CNY", model.JSON{"input_price_per_1m_tokens": int64(9_000_000)})
	if bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{tokenRow}, nil, tokenExtra, 0); status != officialDiscountAvailable || bps == nil || *bps != 10_000 {
		t.Fatalf("cold-start supplement = %v, %s", bps, status)
	}
}

func supplementalPricesForTest(providerID int64, modelName, billingType, currency string, config model.JSON) supplementalOfficialPrices {
	return buildSupplementalOfficialPrices([]model.ModelOfficialPrice{{
		ModelProviderID:       providerID,
		ModelName:             modelName,
		BillingType:           billingType,
		Currency:              currency,
		IsActive:              true,
		NormalizedPriceConfig: config,
	}})
}

func TestCalculateModelGroupOfficialDiscount(t *testing.T) {
	catalog := &liteLLMPriceCatalog{
		exact: map[string]liteLLMTokenPrice{
			"provider/model-a": {InputUSDPerToken: 0.00001, OutputUSDPerToken: 0.00002},
			"provider/model-b": {InputUSDPerToken: 0.00002, OutputUSDPerToken: 0.00004},
		},
		byModel: map[string][]string{
			"model-a": {"provider/model-a"},
			"model-b": {"provider/model-b"},
		},
	}
	consistent := []modelGroupDiscountRow{
		{Model: "provider/model-a", BillingType: "token", BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  float64(21_600_000),
			"output_price_per_1m_tokens": float64(43_200_000),
		}},
		{Model: "model-b", BillingType: "token", BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  float64(43_200_000),
			"output_price_per_1m_tokens": float64(86_400_000),
		}},
		{Model: "missing", BillingType: "token", BillingConfig: model.JSON{
			"input_price_per_1m_tokens": float64(1),
		}},
	}
	bps, status := calculateModelGroupOfficialDiscount(consistent, catalog, nil, 7.2)
	if status != officialDiscountAvailable || bps == nil || *bps != 3000 {
		t.Fatalf("consistent discount = %v, %q, want 3000, available", bps, status)
	}

	inconsistent := []modelGroupDiscountRow{{
		Model: "provider/model-a", BillingType: "token", BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  float64(21_600_000),
			"output_price_per_1m_tokens": float64(72_000_000),
		},
	}}
	bps, status = calculateModelGroupOfficialDiscount(inconsistent, catalog, nil, 7.2)
	if status != officialDiscountInconsistent || bps != nil {
		t.Fatalf("mixed discount = %v, %q, want nil, inconsistent", bps, status)
	}

	unavailable := []modelGroupDiscountRow{
		{Model: "missing", BillingType: "token", BillingConfig: model.JSON{"input_price_per_1m_tokens": float64(21_600_000)}},
		{Model: "provider/model-a", BillingType: "image", BillingConfig: model.JSON{"input_price_per_1m_tokens": float64(21_600_000)}},
	}
	bps, status = calculateModelGroupOfficialDiscount(unavailable, catalog, nil, 7.2)
	if status != officialDiscountUnavailable || bps != nil {
		t.Fatalf("unavailable discount = %v, %q, want nil, unavailable", bps, status)
	}
}

func TestCalculateModelGroupOfficialDiscountRoundsToTenBPS(t *testing.T) {
	catalog := &liteLLMPriceCatalog{
		exact:   map[string]liteLLMTokenPrice{"model": {InputUSDPerToken: 0.00001}},
		byModel: map[string][]string{"model": {"model"}},
	}
	rows := []modelGroupDiscountRow{{
		Model: "model", BillingType: "token",
		BillingConfig: model.JSON{"input_price_per_1m_tokens": float64(23_400_000)},
	}}
	bps, status := calculateModelGroupOfficialDiscount(rows, catalog, nil, 7.2)
	if status != officialDiscountAvailable || bps == nil || *bps != 3250 {
		t.Fatalf("rounded discount = %v, %q, want 3250, available", bps, status)
	}
}

func TestModelGroupOfficialDiscountSerialization(t *testing.T) {
	bps := int64(3000)
	available, err := json.Marshal(ModelGroupSummary{OfficialDiscountBPS: &bps, OfficialDiscountStatus: officialDiscountAvailable})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(available), `"official_discount_bps":3000`) || !strings.Contains(string(available), `"official_discount_status":"available"`) {
		t.Fatalf("available JSON = %s", available)
	}
	unavailable, err := json.Marshal(ModelGroupSummary{OfficialDiscountStatus: officialDiscountUnavailable})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(unavailable), "official_discount_bps") || !strings.Contains(string(unavailable), `"official_discount_status":"unavailable"`) {
		t.Fatalf("unavailable JSON = %s", unavailable)
	}
}

func TestModelGroupOfficialDiscountEnrichmentSurvivesCatalogFailure(t *testing.T) {
	bps := int64(3000)
	groups := []ModelGroupSummary{
		{ModelGroup: model.ModelGroup{ID: 1}, OfficialDiscountBPS: &bps, OfficialDiscountStatus: officialDiscountAvailable},
		{ModelGroup: model.ModelGroup{ID: 2}},
	}
	applyModelGroupOfficialDiscounts(groups, nil, nil, nil, 7.2)
	for _, group := range groups {
		if group.OfficialDiscountStatus != officialDiscountUnavailable || group.OfficialDiscountBPS != nil {
			t.Fatalf("group %d after catalog failure = %v, %q", group.ID, group.OfficialDiscountBPS, group.OfficialDiscountStatus)
		}
	}
}
