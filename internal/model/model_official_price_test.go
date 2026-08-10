package model

import (
	"bytes"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestModelOfficialPriceSchemaContract(t *testing.T) {
	typ := reflect.TypeOf(ModelOfficialPrice{})
	fields := map[string]struct {
		typ  reflect.Type
		tags []string
	}{
		"ID":                    {reflect.TypeOf(int64(0)), []string{"pk", "autoincr", "'id'"}},
		"ModelProviderID":       {reflect.TypeOf(int64(0)), []string{"notnull", "uq_model_official_prices_provider_model_type", "idx_model_official_prices_lookup"}},
		"ModelName":             {reflect.TypeOf(""), []string{"notnull", "uq_model_official_prices_provider_model_type", "idx_model_official_prices_lookup"}},
		"BillingType":           {reflect.TypeOf(""), []string{"notnull", "uq_model_official_prices_provider_model_type", "idx_model_official_prices_lookup"}},
		"Currency":              {reflect.TypeOf(""), []string{"notnull", "'currency'"}},
		"SourcePriceConfig":     {reflect.TypeOf(JSON{}), []string{"jsonb", "notnull", "'source_price_config'"}},
		"NormalizedPriceConfig": {reflect.TypeOf(JSON{}), []string{"jsonb", "notnull", "'normalized_price_config'"}},
		"ExchangeRateUsed":      {reflect.TypeOf(""), []string{"notnull", "'exchange_rate_used'"}},
		"ExchangeRateDate":      {reflect.TypeOf(""), []string{"notnull", "'exchange_rate_date'"}},
		"IsActive":              {reflect.TypeOf(false), []string{"notnull", "idx_model_official_prices_lookup", "'is_active'"}},
		"CreatedAt":             {reflect.TypeOf(time.Time{}), []string{"created", "'created_at'"}},
		"UpdatedAt":             {reflect.TypeOf(time.Time{}), []string{"updated", "'updated_at'"}},
	}
	for name, want := range fields {
		field, ok := typ.FieldByName(name)
		if !ok {
			t.Fatalf("missing field %s", name)
		}
		if field.Type != want.typ {
			t.Fatalf("field %s type = %v, want %v", name, field.Type, want.typ)
		}
		tag := field.Tag.Get("xorm")
		for _, part := range want.tags {
			if !strings.Contains(tag, part) {
				t.Errorf("field %s xorm tag %q missing %q", name, tag, part)
			}
		}
	}
	if got := (&ModelOfficialPrice{}).TableName(); got != "model_official_prices" {
		t.Fatalf("TableName() = %q", got)
	}

	migration, err := os.ReadFile("../../scripts/migrate_20260809_model_official_prices.sql")
	if err != nil {
		t.Fatal(err)
	}
	compactMigration := strings.ToLower(strings.Join(strings.Fields(string(migration)), " "))
	for _, clause := range []string{
		"create table if not exists model_official_prices",
		"foreign key (model_provider_id) references model_providers (id) on delete restrict",
		"check (model_name <> '' and model_name = btrim(model_name))",
		"check (billing_type in ('token', 'image', 'video', 'audio', 'count'))",
		"check (currency in ('usd', 'cny'))",
		"unique (model_provider_id, model_name, billing_type)",
		"create index if not exists idx_model_official_prices_lookup on model_official_prices (model_provider_id, model_name, billing_type, is_active)",
	} {
		if !strings.Contains(compactMigration, clause) {
			t.Errorf("migration missing %q", clause)
		}
	}
	for _, constraint := range []string{
		"fk_model_official_prices_model_provider",
		"ck_model_official_prices_model_name_trimmed",
		"ck_model_official_prices_billing_type",
		"ck_model_official_prices_currency",
		"uq_model_official_prices_provider_model_type",
	} {
		if !strings.Contains(compactMigration, "where conname = '"+constraint+"'") ||
			!strings.Contains(compactMigration, "add constraint "+constraint) {
			t.Errorf("migration does not converge existing tables for %q", constraint)
		}
	}
	if !bytes.Contains(migration, []byte("BEGIN;")) || !bytes.Contains(migration, []byte("COMMIT;")) {
		t.Error("migration must be transactional")
	}

	dbSource, err := os.ReadFile("../db/db.go")
	if err != nil {
		t.Fatal(err)
	}
	providerPos := bytes.Index(dbSource, []byte("if err := ensureModelProviderTable(); err != nil"))
	officialPricePos := bytes.Index(dbSource, []byte("new(model.ModelOfficialPrice)"))
	if providerPos < 0 || officialPricePos < 0 || providerPos > officialPricePos {
		t.Fatal("database startup must ensure ModelProvider before syncing ModelOfficialPrice")
	}

	readme, err := os.ReadFile("../../README.md")
	if err != nil {
		t.Fatal(err)
	}
	const migrationCommand = "psql -U <user> -d <db> -f scripts/migrate_20260809_model_official_prices.sql"
	if !bytes.Contains(readme, []byte(migrationCommand)) {
		t.Fatalf("README missing %q", migrationCommand)
	}
}
