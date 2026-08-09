package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestParseFrankfurterUSDCNYRate(t *testing.T) {
	body := `{"date":"2026-08-09","base":"USD","quote":"CNY","rate":6.7444}`
	got, err := parseFrankfurterUSDCNYRate(strings.NewReader(body), 64<<10)
	if err != nil || got.Value != "6.7444" || got.Date != "2026-08-09" {
		t.Fatalf("rate=%#v err=%v", got, err)
	}
}

func TestParseFrankfurterUSDCNYRateRejectsInvalidResponses(t *testing.T) {
	tests := map[string]string{
		"wrong base":  `{"date":"2026-08-09","base":"EUR","quote":"CNY","rate":1}`,
		"wrong quote": `{"date":"2026-08-09","base":"USD","quote":"EUR","rate":1}`,
		"bad date":    `{"date":"09/08/2026","base":"USD","quote":"CNY","rate":1}`,
		"zero":        `{"date":"2026-08-09","base":"USD","quote":"CNY","rate":0}`,
		"negative":    `{"date":"2026-08-09","base":"USD","quote":"CNY","rate":-1}`,
		"string rate": `{"date":"2026-08-09","base":"USD","quote":"CNY","rate":"6.7"}`,
		"malformed":   `{"date":`,
		"trailing":    `{"date":"2026-08-09","base":"USD","quote":"CNY","rate":1}{}`,
	}
	for name, body := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := parseFrankfurterUSDCNYRate(strings.NewReader(body), 64<<10); err == nil {
				t.Fatal("invalid response accepted")
			}
		})
	}
	valid := `{"date":"2026-08-09","base":"USD","quote":"CNY","rate":1}`
	if _, err := parseFrankfurterUSDCNYRate(strings.NewReader(valid), 16); err == nil {
		t.Fatal("oversized response accepted")
	}
}

func TestFetchFrankfurterUSDCNYRate(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				t.Errorf("method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"date":"2026-08-09","base":"USD","quote":"CNY","rate":6.7444}`))
		}))
		defer server.Close()
		got, err := fetchFrankfurterUSDCNYRate(context.Background(), server.Client(), server.URL)
		if err != nil || got.Value != "6.7444" {
			t.Fatalf("rate=%#v err=%v", got, err)
		}
	})

	t.Run("HTTP failure", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
		}))
		defer server.Close()
		if _, err := fetchFrankfurterUSDCNYRate(context.Background(), server.Client(), server.URL); err == nil {
			t.Fatal("HTTP 503 accepted")
		}
	})
}

func TestAutomaticUSDCNYExchangeRateRequiresCompleteMetadata(t *testing.T) {
	complete := map[string]string{
		USDCNYExchangeRateSettingKey:         "6.7444",
		USDCNYExchangeRateSourceSettingKey:   "frankfurter",
		USDCNYExchangeRateDateSettingKey:     "2026-08-09",
		USDCNYExchangeRateSyncedAtSettingKey: "2026-08-09T12:00:00Z",
	}
	if got, ok := parseAutomaticUSDCNYExchangeRate(complete); !ok || got != 6.7444 {
		t.Fatalf("complete automatic rate = %v, %v", got, ok)
	}
	for _, missing := range []string{
		USDCNYExchangeRateSettingKey,
		USDCNYExchangeRateSourceSettingKey,
		USDCNYExchangeRateDateSettingKey,
		USDCNYExchangeRateSyncedAtSettingKey,
	} {
		incomplete := make(map[string]string, len(complete))
		for key, value := range complete {
			incomplete[key] = value
		}
		delete(incomplete, missing)
		if _, ok := parseAutomaticUSDCNYExchangeRate(incomplete); ok {
			t.Fatalf("rate without %s accepted", missing)
		}
	}
	complete[USDCNYExchangeRateSourceSettingKey] = "manual"
	if _, ok := parseAutomaticUSDCNYExchangeRate(complete); ok {
		t.Fatal("manual rate accepted")
	}
}

func TestUSDCNYExchangeRateSyncLoopRunsImmediatelyAndStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := make(chan struct{}, 1)
	done := make(chan struct{})
	go func() {
		runUSDCNYExchangeRateSyncLoop(ctx, time.Hour, func(context.Context) {
			calls <- struct{}{}
		})
		close(done)
	}()
	select {
	case <-calls:
	case <-time.After(time.Second):
		t.Fatal("initial sync did not run")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("sync loop did not stop")
	}
}

func TestUSDCNYExchangeRateSyncRejectsOverlap(t *testing.T) {
	var running atomic.Bool
	started := make(chan struct{})
	release := make(chan struct{})
	done := make(chan struct{})
	go func() {
		runUSDCNYExchangeRateSyncOnce(context.Background(), &running, func(context.Context) {
			close(started)
			<-release
		})
		close(done)
	}()
	<-started
	if runUSDCNYExchangeRateSyncOnce(context.Background(), &running, func(context.Context) {
		t.Fatal("overlapping sync ran")
	}) {
		t.Fatal("overlapping sync reported success")
	}
	close(release)
	<-done
}
