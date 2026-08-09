package service

import (
	"errors"
	"math"
	"testing"

	"fanapi/internal/model"
)

func TestValidateOfficialPriceInputRequiresProvider(t *testing.T) {
	err := validateModelOfficialPriceInput(CreateModelOfficialPriceInput{
		ModelName: "qwen-max", BillingType: "token", Currency: "CNY",
		SourcePriceConfig: model.JSON{"input_price_per_1m_tokens": "2"},
	})
	if !errors.Is(err, ErrModelOfficialPriceProviderNotFound) {
		t.Fatalf("err=%v", err)
	}
}

func TestNormalizeOfficialPriceConfig(t *testing.T) {
	got, err := NormalizeOfficialPriceConfig("USD", "token", model.JSON{
		"input_price_per_1m_tokens":      "2.5",
		"cache_read_price_per_1m_tokens": "0.25",
	}, "6.7444")
	if err != nil {
		t.Fatal(err)
	}
	if got["input_price_per_1m_tokens"] != int64(16_861_000) ||
		got["cache_read_price_per_1m_tokens"] != int64(1_686_100) {
		t.Fatalf("normalized = %#v", got)
	}
}

func TestNormalizeOfficialPriceConfigRejectsZero(t *testing.T) {
	_, err := NormalizeOfficialPriceConfig("CNY", "video", model.JSON{"price_per_second": "0"}, "")
	if err == nil {
		t.Fatal("zero price accepted")
	}
}

func TestOfficialPriceNormalizationMatrix(t *testing.T) {
	tests := []struct {
		name     string
		currency string
		billing  string
		source   model.JSON
		rate     string
		want     model.JSON
		wantErr  bool
	}{
		{name: "CNY count", currency: "CNY", billing: "count", source: model.JSON{"price_per_call": "0.1234567"}, want: model.JSON{"price_per_call": int64(123_457)}},
		{name: "image tiers", currency: "CNY", billing: "image", source: model.JSON{
			"base_price": "0.5", "default_size_price": "0.75",
			"size_prices": map[string]interface{}{"1k": "1", "4k": "2.25"},
		}, want: model.JSON{
			"base_price": int64(500_000), "default_size_price": int64(750_000),
			"size_prices": map[string]interface{}{"1k": int64(1_000_000), "4k": int64(2_250_000)},
		}},
		{name: "USD per second", currency: "USD", billing: "audio", source: model.JSON{"price_per_second": "0.01"}, rate: "6.7444", want: model.JSON{"price_per_second": int64(67_444)}},
		{name: "half rounds away", currency: "CNY", billing: "count", source: model.JSON{"price_per_call": "0.0000005"}, want: model.JSON{"price_per_call": int64(1)}},
		{name: "invalid currency", currency: "EUR", billing: "count", source: model.JSON{"price_per_call": "1"}, wantErr: true},
		{name: "wrong billing field", currency: "CNY", billing: "video", source: model.JSON{"price_per_call": "1"}, wantErr: true},
		{name: "raw JSON number", currency: "CNY", billing: "count", source: model.JSON{"price_per_call": 1.25}, wantErr: true},
		{name: "bad rate", currency: "USD", billing: "video", source: model.JSON{"price_per_second": "1"}, rate: "NaN", wantErr: true},
		{name: "overflow", currency: "CNY", billing: "count", source: model.JSON{"price_per_call": "9223372036855"}, wantErr: true},
		{name: "unknown billing", currency: "CNY", billing: "music", source: model.JSON{"price_per_call": "1"}, wantErr: true},
		{name: "empty config", currency: "CNY", billing: "token", source: model.JSON{}, wantErr: true},
		{name: "unknown image tier", currency: "CNY", billing: "image", source: model.JSON{"size_prices": map[string]interface{}{"8k": "1"}}, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeOfficialPriceConfig(tt.currency, tt.billing, tt.source, tt.rate)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("normalized invalid quote: %#v", got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			assertOfficialPriceJSON(t, got, tt.want)
		})
	}
}

func assertOfficialPriceJSON(t *testing.T, got, want model.JSON) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("normalized = %#v, want %#v", got, want)
	}
	for key, wantValue := range want {
		switch nestedWant := wantValue.(type) {
		case map[string]interface{}:
			nestedGot, ok := got[key].(map[string]interface{})
			if !ok || len(nestedGot) != len(nestedWant) {
				t.Fatalf("normalized[%q] = %#v, want %#v", key, got[key], nestedWant)
			}
			for nestedKey, nestedValue := range nestedWant {
				if nestedGot[nestedKey] != nestedValue {
					t.Fatalf("normalized[%q][%q] = %#v, want %#v", key, nestedKey, nestedGot[nestedKey], nestedValue)
				}
			}
		default:
			if got[key] != wantValue {
				t.Fatalf("normalized[%q] = %#v, want %#v", key, got[key], wantValue)
			}
		}
	}
}

func TestOfficialPriceNormalizationRejectsNonFiniteSourceShapes(t *testing.T) {
	for _, value := range []interface{}{math.NaN(), math.Inf(1), nil, true} {
		if _, err := NormalizeOfficialPriceConfig("CNY", "count", model.JSON{"price_per_call": value}, ""); err == nil {
			t.Fatalf("accepted source value %#v", value)
		}
	}
}
