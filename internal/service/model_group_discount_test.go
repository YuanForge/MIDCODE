package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
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

func TestUSDCNYExchangeRateOrDefault(t *testing.T) {
	if got := USDCNYExchangeRateOrDefault("bad"); got != 7.2 {
		t.Fatalf("USDCNYExchangeRateOrDefault = %v, want 7.2", got)
	}
}

func TestLiteLLMTokenPricesAndModelMatch(t *testing.T) {
	fixture := `{
		"provider/model-a":{"mode":"chat","input_cost_per_token":0.00001,"output_cost_per_token":0.00002},
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
	if !ok || exact.InputUSDPerToken != 0.00001 || exact.OutputUSDPerToken != 0.00002 {
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
