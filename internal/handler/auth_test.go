package handler

import (
	"testing"

	"fanapi/internal/model"
)

func TestPreferDisplayChannelUsesLowestTokenPrice(t *testing.T) {
	current := model.Channel{
		ID:          9,
		BillingType: "token",
		Priority:    99,
		BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  3600000,
			"output_price_per_1m_tokens": 22000000,
		},
	}
	candidate := model.Channel{
		ID:          24,
		BillingType: "token",
		Priority:    99,
		BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  2100000,
			"output_price_per_1m_tokens": 13000000,
		},
	}

	if !preferDisplayChannel(candidate, current, "") {
		t.Fatalf("expected 2.1 + 13 token price to beat 3.6 + 22")
	}
}

func TestPreferDisplayChannelUsesGroupPrice(t *testing.T) {
	current := model.Channel{
		ID:          1,
		BillingType: "token",
		Priority:    99,
		BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  2000000,
			"output_price_per_1m_tokens": 10000000,
			"pricing_groups": map[string]interface{}{
				"vip": map[string]interface{}{
					"input_price_per_1m_tokens":  5000000,
					"output_price_per_1m_tokens": 20000000,
				},
			},
		},
	}
	candidate := model.Channel{
		ID:          2,
		BillingType: "token",
		Priority:    99,
		BillingConfig: model.JSON{
			"input_price_per_1m_tokens":  6000000,
			"output_price_per_1m_tokens": 30000000,
			"pricing_groups": map[string]interface{}{
				"vip": map[string]interface{}{
					"input_price_per_1m_tokens":  1000000,
					"output_price_per_1m_tokens": 6000000,
				},
			},
		},
	}

	if !preferDisplayChannel(candidate, current, "vip") {
		t.Fatalf("expected representative selection to use the logged-in user's group price")
	}
}
