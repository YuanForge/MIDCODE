package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"xorm.io/xorm"
)

func TestModelOfficialPricePostgres(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("FANAPI_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("FANAPI_TEST_DATABASE_URL is not set")
	}

	adminEngine, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer adminEngine.Close()
	schema := fmt.Sprintf("official_price_test_%d", time.Now().UnixNano())
	if _, err := adminEngine.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = adminEngine.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`)
	})

	testEngine, err := xorm.NewEngine("postgres", dsn+" search_path="+schema)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = testEngine.Close() })
	if _, err := testEngine.Exec(`
		CREATE TABLE model_providers (
			id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
			is_active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE TABLE system_settings (
			id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE TABLE admin_audit_logs (
			id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL, admin_email TEXT, action TEXT,
			resource_type TEXT, resource_id BIGINT NOT NULL DEFAULT 0, summary TEXT, detail JSONB,
			ip TEXT, ua TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("../../scripts/migrate_20260809_model_official_prices.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testEngine.Exec(string(migration)); err != nil {
		t.Fatal(err)
	}

	previousEngine := db.Engine
	db.Engine = testEngine
	t.Cleanup(func() { db.Engine = previousEngine })
	ctx := context.Background()
	provider := &model.ModelProvider{Code: "test", Name: "Test", IsActive: true}
	if _, err := testEngine.Insert(provider); err != nil {
		t.Fatal(err)
	}

	t.Run("unique constraint", func(t *testing.T) {
		first := testOfficialPrice(provider.ID, "duplicate", "CNY", "1")
		if _, err := testEngine.Insert(first); err != nil {
			t.Fatal(err)
		}
		duplicate := testOfficialPrice(provider.ID, "duplicate", "CNY", "2")
		if _, err := testEngine.Insert(duplicate); err == nil {
			t.Fatal("duplicate provider/model/billing type inserted")
		}
	})

	initialTime := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	if err := persistUSDCNYExchangeRateSuccess(ctx, frankfurterUSDCNYRate{Value: "6", Date: "2026-08-08"}, initialTime); err != nil {
		t.Fatal(err)
	}
	usdOne, err := CreateModelOfficialPrice(ctx, CreateModelOfficialPriceInput{
		ModelProviderID: provider.ID, ModelName: "usd-one", BillingType: "count", Currency: "USD",
		SourcePriceConfig: model.JSON{"price_per_call": "1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	usdTwo, err := CreateModelOfficialPrice(ctx, CreateModelOfficialPriceInput{
		ModelProviderID: provider.ID, ModelName: "usd-two", BillingType: "count", Currency: "USD",
		SourcePriceConfig: model.JSON{"price_per_call": "2"},
	})
	if err != nil {
		t.Fatal(err)
	}
	cny, err := CreateModelOfficialPrice(ctx, CreateModelOfficialPriceInput{
		ModelProviderID: provider.ID, ModelName: "cny", BillingType: "count", Currency: "CNY",
		SourcePriceConfig: model.JSON{"price_per_call": "3"},
	})
	if err != nil {
		t.Fatal(err)
	}
	cnyBefore := canonicalJSON(t, cny.NormalizedPriceConfig)

	if err := persistUSDCNYExchangeRateSuccess(ctx, frankfurterUSDCNYRate{Value: "7", Date: "2026-08-09"}, initialTime.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	assertStoredOfficialPrice(t, testEngine, usdOne.ID, "7", int64(7_000_000))
	assertStoredOfficialPrice(t, testEngine, usdTwo.ID, "7", int64(14_000_000))
	var storedCNY model.ModelOfficialPrice
	if found, err := testEngine.ID(cny.ID).Get(&storedCNY); err != nil || !found {
		t.Fatalf("load CNY row: found=%v err=%v", found, err)
	}
	if got := canonicalJSON(t, storedCNY.NormalizedPriceConfig); got != cnyBefore {
		t.Fatalf("CNY normalized price changed: before=%s after=%s", cnyBefore, got)
	}

	overflow := testOfficialPrice(provider.ID, "overflow", "USD", "9223372036855")
	overflow.NormalizedPriceConfig = model.JSON{"price_per_call": int64(1)}
	overflow.ExchangeRateUsed = "7"
	overflow.ExchangeRateDate = "2026-08-09"
	if _, err := testEngine.Insert(overflow); err != nil {
		t.Fatal(err)
	}
	beforeRows := storedOfficialPriceState(t, testEngine)
	beforeSettings := storedExchangeRateState(t, testEngine)
	if err := persistUSDCNYExchangeRateSuccess(ctx, frankfurterUSDCNYRate{Value: "8", Date: "2026-08-10"}, initialTime.Add(2*time.Hour)); err == nil {
		t.Fatal("overflowing refresh succeeded")
	}
	if got := storedOfficialPriceState(t, testEngine); got != beforeRows {
		t.Fatalf("official prices changed after rollback\nbefore=%s\nafter=%s", beforeRows, got)
	}
	if got := storedExchangeRateState(t, testEngine); got != beforeSettings {
		t.Fatalf("exchange settings changed after rollback\nbefore=%s\nafter=%s", beforeSettings, got)
	}
}

func testOfficialPrice(providerID int64, name, currency, source string) *model.ModelOfficialPrice {
	return &model.ModelOfficialPrice{
		ModelProviderID: providerID, ModelName: name, BillingType: "count", Currency: currency,
		SourcePriceConfig:     model.JSON{"price_per_call": source},
		NormalizedPriceConfig: model.JSON{"price_per_call": int64(1)}, IsActive: true,
	}
}

func assertStoredOfficialPrice(t *testing.T, engine *xorm.Engine, id int64, rate string, credits int64) {
	t.Helper()
	var price model.ModelOfficialPrice
	if found, err := engine.ID(id).Get(&price); err != nil || !found {
		t.Fatalf("load price %d: found=%v err=%v", id, found, err)
	}
	if price.ExchangeRateUsed != rate || price.NormalizedPriceConfig["price_per_call"] != float64(credits) {
		t.Fatalf("price %d = rate %q normalized %#v", id, price.ExchangeRateUsed, price.NormalizedPriceConfig)
	}
}

func storedOfficialPriceState(t *testing.T, engine *xorm.Engine) string {
	t.Helper()
	var rows []model.ModelOfficialPrice
	if err := engine.OrderBy("id").Find(&rows); err != nil {
		t.Fatal(err)
	}
	return canonicalJSON(t, rows)
}

func storedExchangeRateState(t *testing.T, engine *xorm.Engine) string {
	t.Helper()
	var rows []model.SystemSetting
	if err := engine.Where("key LIKE ?", "usd_cny_exchange_rate%").OrderBy("key").Find(&rows); err != nil {
		t.Fatal(err)
	}
	return canonicalJSON(t, rows)
}

func canonicalJSON(t *testing.T, value interface{}) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}
