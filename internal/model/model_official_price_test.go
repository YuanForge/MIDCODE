package model

import (
	"bytes"
	"os"
	"reflect"
	"testing"
)

func TestModelOfficialPriceSchemaContract(t *testing.T) {
	typ := reflect.TypeOf(ModelOfficialPrice{})
	for _, name := range []string{
		"ModelProviderID", "ModelName", "BillingType", "Currency",
		"SourcePriceConfig", "NormalizedPriceConfig", "ExchangeRateUsed",
		"ExchangeRateDate", "IsActive",
	} {
		if _, ok := typ.FieldByName(name); !ok {
			t.Fatalf("missing field %s", name)
		}
	}

	migration, err := os.ReadFile("../../scripts/migrate_20260809_model_official_prices.sql")
	if err != nil || !bytes.Contains(migration, []byte("model_official_prices")) {
		t.Fatalf("migration contract missing: %v", err)
	}
}
