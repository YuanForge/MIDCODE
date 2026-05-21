package billing

import (
	"testing"

	"fanapi/internal/model"
)

func TestCalcActualCost_ResponsesCacheReadTokensNotDoubleCharged(t *testing.T) {
	channel := &model.Channel{
		BillingType: "token",
		Protocol:    "responses",
		BillingConfig: model.JSON{
			"input_from_response":            true,
			"input_price_per_1m_tokens":      int64(1750000),
			"output_price_per_1m_tokens":     int64(10500000),
			"cache_read_price_per_1m_tokens": int64(175000),
			"metric_paths":                   map[string]interface{}{},
		},
	}

	resp := map[string]interface{}{
		"usage": map[string]interface{}{
			"prompt_tokens":     int64(18238),
			"completion_tokens": int64(69),
			"cache_read_tokens": int64(13696),
		},
	}

	cost, err := CalcActualCost(channel, nil, resp)
	if err != nil {
		t.Fatalf("CalcActualCost returned error: %v", err)
	}

	const want int64 = 11071
	if cost != want {
		t.Fatalf("CalcActualCost = %d, want %d", cost, want)
	}
}

func TestCalcActualUpstreamCost_ResponsesCacheReadTokensNotDoubleCharged(t *testing.T) {
	channel := &model.Channel{
		BillingType: "token",
		Protocol:    "responses",
		BillingConfig: model.JSON{
			"input_from_response":           true,
			"input_cost_per_1m_tokens":      int64(1750000),
			"output_cost_per_1m_tokens":     int64(10500000),
			"cache_read_cost_per_1m_tokens": int64(175000),
			"metric_paths":                  map[string]interface{}{},
		},
	}

	resp := map[string]interface{}{
		"usage": map[string]interface{}{
			"prompt_tokens":     int64(18238),
			"completion_tokens": int64(69),
			"cache_read_tokens": int64(13696),
		},
	}

	cost, err := CalcActualUpstreamCost(channel, nil, resp)
	if err != nil {
		t.Fatalf("CalcActualUpstreamCost returned error: %v", err)
	}

	const want int64 = 11071
	if cost != want {
		t.Fatalf("CalcActualUpstreamCost = %d, want %d", cost, want)
	}
}
