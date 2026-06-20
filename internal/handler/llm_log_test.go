package handler

import (
	"testing"

	"fanapi/internal/billing"
	"fanapi/internal/model"
	"fanapi/internal/service"
)

func withTestVIPDiscount(t *testing.T, discounts map[string]int64) {
	t.Helper()
	billing.RegisterVIPDiscountLookup(func(group string) int64 {
		if discount, ok := discounts[group]; ok {
			return discount
		}
		return 10000
	})
	t.Cleanup(func() {
		billing.RegisterVIPDiscountLookup(service.VIPDiscountBpsForGroup)
	})
}

func int64PtrValue(t *testing.T, value *int64) int64 {
	t.Helper()
	if value == nil {
		t.Fatalf("expected int64 pointer, got nil")
	}
	return *value
}

func ptrInt64(value int64) *int64 {
	return &value
}

func TestResolveTokenPriceMetaUsesEffectiveVIPPrice(t *testing.T) {
	withTestVIPDiscount(t, map[string]int64{"vip5": 5000})

	channel := model.Channel{
		BillingType: "token",
		BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  2000000,
			"output_price_per_1m_tokens": 10000000,
			"pricing_groups": map[string]interface{}{
				"vip5": map[string]interface{}{
					"input_price_per_1m_tokens":  1000000,
					"output_price_per_1m_tokens": 6000000,
				},
			},
		},
	}

	meta := resolveTokenPriceMeta(&channel, "vip5")

	if got := int64PtrValue(t, meta.InputPricePer1MTokens); got != 500000 {
		t.Fatalf("input price = %d, want 500000", got)
	}
	if got := int64PtrValue(t, meta.OutputPricePer1MTokens); got != 3000000 {
		t.Fatalf("output price = %d, want 3000000", got)
	}
}

func TestDisplayTokenPriceMetaReplacesLegacyStoredPrices(t *testing.T) {
	withTestVIPDiscount(t, map[string]int64{"vip5": 8000})

	channel := model.Channel{
		BillingType: "token",
		BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  2000000,
			"output_price_per_1m_tokens": 10000000,
			"pricing_groups": map[string]interface{}{
				"vip5": map[string]interface{}{
					"input_price_per_1m_tokens":  1500000,
					"output_price_per_1m_tokens": 6000000,
				},
			},
		},
	}

	fromBase := displayTokenPriceMeta(&channel, tokenPriceMeta{
		InputPricePer1MTokens:  ptrInt64(2000000),
		OutputPricePer1MTokens: ptrInt64(10000000),
	}, "vip5", "")
	if got := int64PtrValue(t, fromBase.InputPricePer1MTokens); got != 1200000 {
		t.Fatalf("input price from base = %d, want 1200000", got)
	}
	if got := int64PtrValue(t, fromBase.OutputPricePer1MTokens); got != 4800000 {
		t.Fatalf("output price from base = %d, want 4800000", got)
	}

	fromLegacyGroup := displayTokenPriceMeta(&channel, tokenPriceMeta{
		InputPricePer1MTokens:  ptrInt64(1500000),
		OutputPricePer1MTokens: ptrInt64(6000000),
	}, "vip5", "")
	if got := int64PtrValue(t, fromLegacyGroup.InputPricePer1MTokens); got != 1200000 {
		t.Fatalf("input price from legacy group = %d, want 1200000", got)
	}
	if got := int64PtrValue(t, fromLegacyGroup.OutputPricePer1MTokens); got != 4800000 {
		t.Fatalf("output price from legacy group = %d, want 4800000", got)
	}

	alreadySpecific := displayTokenPriceMeta(&channel, tokenPriceMeta{
		InputPricePer1MTokens:  ptrInt64(1111111),
		OutputPricePer1MTokens: ptrInt64(2222222),
	}, "vip5", "")
	if got := int64PtrValue(t, alreadySpecific.InputPricePer1MTokens); got != 1111111 {
		t.Fatalf("specific input price = %d, want 1111111", got)
	}
	if got := int64PtrValue(t, alreadySpecific.OutputPricePer1MTokens); got != 2222222 {
		t.Fatalf("specific output price = %d, want 2222222", got)
	}
}
