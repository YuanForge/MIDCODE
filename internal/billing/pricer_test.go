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

func TestCalcForUser_VideoPricePerSecondWithStringDuration(t *testing.T) {
	channel := &model.Channel{
		BillingType: "video",
		BillingConfig: model.JSON{
			"price_per_second": int64(48000),
			"metric_paths": map[string]interface{}{
				"size":         "request.size",
				"aspect_ratio": "request.aspect_ratio",
				"duration":     "request.duration",
			},
		},
	}

	req := map[string]interface{}{
		"size":         "720p",
		"aspect_ratio": "16:9",
		"duration":     "5",
	}

	cost, _, err := CalcForUser(channel, req, "")
	if err != nil {
		t.Fatalf("CalcForUser returned error: %v", err)
	}

	const want int64 = 240000
	if cost != want {
		t.Fatalf("CalcForUser = %d, want %d", cost, want)
	}
}

func TestCalcForUser_AppliesVIPDiscountWithIntegerBps(t *testing.T) {
	RegisterVIPDiscountLookup(func(group string) int64 {
		if group == "vip" {
			return 8500
		}
		return 10000
	})
	defer RegisterVIPDiscountLookup(nil)

	channel := &model.Channel{
		BillingType: "count",
		BillingConfig: model.JSON{
			"price_per_call": int64(101),
		},
	}

	cost, _, err := CalcForUser(channel, nil, "vip")
	if err != nil {
		t.Fatalf("CalcForUser returned error: %v", err)
	}

	const want int64 = 86
	if cost != want {
		t.Fatalf("CalcForUser = %d, want %d", cost, want)
	}
}

func TestCalcForUser_VIPDiscountDoesNotRoundToZero(t *testing.T) {
	RegisterVIPDiscountLookup(func(group string) int64 {
		if group == "vip" {
			return 1
		}
		return 10000
	})
	defer RegisterVIPDiscountLookup(nil)

	channel := &model.Channel{
		BillingType: "count",
		BillingConfig: model.JSON{
			"price_per_call": int64(1),
		},
	}

	cost, _, err := CalcForUser(channel, nil, "vip")
	if err != nil {
		t.Fatalf("CalcForUser returned error: %v", err)
	}

	const want int64 = 1
	if cost != want {
		t.Fatalf("CalcForUser = %d, want %d", cost, want)
	}
}

func TestCalcUpstreamCost_VideoCostPerSecondWithStringDuration(t *testing.T) {
	channel := &model.Channel{
		BillingType: "video",
		BillingConfig: model.JSON{
			"cost_per_second": int64(40000),
			"metric_paths": map[string]interface{}{
				"size":         "request.size",
				"aspect_ratio": "request.aspect_ratio",
				"duration":     "request.duration",
			},
		},
	}

	req := map[string]interface{}{
		"size":         "720p",
		"aspect_ratio": "16:9",
		"duration":     "5",
	}

	cost, err := CalcUpstreamCost(channel, req)
	if err != nil {
		t.Fatalf("CalcUpstreamCost returned error: %v", err)
	}

	const want int64 = 200000
	if cost != want {
		t.Fatalf("CalcUpstreamCost = %d, want %d", cost, want)
	}
}

func TestRequestedTierRecognizesOpenAIAndClaudeFast(t *testing.T) {
	for name, req := range map[string]map[string]interface{}{
		"openai priority": {"service_tier": "priority"},
		"legacy fast":     {"service_tier": "fast"},
		"claude fast":     {"speed": "fast"},
	} {
		t.Run(name, func(t *testing.T) {
			if got := RequestedTier(req); got != TierFast {
				t.Fatalf("RequestedTier() = %q, want %q", got, TierFast)
			}
		})
	}
	if got := RequestedTier(map[string]interface{}{"service_tier": "default"}); got != TierStandard {
		t.Fatalf("RequestedTier(default) = %q, want %q", got, TierStandard)
	}
}

func TestCalcActualCostForUserWithTierAppliesFastRatioAfterVIPDiscount(t *testing.T) {
	RegisterVIPDiscountLookup(func(group string) int64 {
		if group == "vip" {
			return 8000
		}
		return 10000
	})
	defer RegisterVIPDiscountLookup(nil)

	channel := &model.Channel{
		BillingType: "token",
		Protocol:    "openai",
		BillingConfig: model.JSON{
			"input_from_response":        true,
			"input_price_per_1m_tokens":  int64(1000000),
			"output_price_per_1m_tokens": int64(2000000),
			"fast_ratio":                 1.75,
		},
	}
	resp := map[string]interface{}{"usage": map[string]interface{}{
		"prompt_tokens": int64(1000000), "completion_tokens": int64(1000000),
	}}

	cost, err := CalcActualCostForUserWithTier(channel, nil, resp, "vip", TierFast)
	if err != nil {
		t.Fatal(err)
	}
	// Standard VIP prices are 800k + 1.6m; fast 1.75x => 1.4m + 2.8m.
	if cost != 4200000 {
		t.Fatalf("cost = %d, want 4200000", cost)
	}
}

func TestCalcActualUpstreamCostWithTierAppliesFastRatio(t *testing.T) {
	channel := &model.Channel{
		BillingType: "token",
		Protocol:    "responses",
		BillingConfig: model.JSON{
			"input_from_response":       true,
			"input_cost_per_1m_tokens":  int64(1000000),
			"output_cost_per_1m_tokens": int64(3000000),
			"fast_ratio":                1.8,
		},
	}
	resp := map[string]interface{}{"usage": map[string]interface{}{
		"prompt_tokens": int64(1000000), "completion_tokens": int64(1000000),
	}}

	cost, err := CalcActualUpstreamCostWithTier(channel, nil, resp, TierFast)
	if err != nil {
		t.Fatal(err)
	}
	if cost != 7200000 {
		t.Fatalf("cost = %d, want 7200000", cost)
	}
}

func TestMultiplyCreditsByFastRatioRoundsUp(t *testing.T) {
	for _, tc := range []struct {
		ratio float64
		want  int64
	}{
		{ratio: 1.7, want: 172},
		{ratio: 1.75, want: 177},
		{ratio: 1.8, want: 182},
		{ratio: 2.0, want: 202},
		{ratio: 6.0, want: 606},
	} {
		if got := multiplyCreditsByRatioCeil(101, tc.ratio); got != tc.want {
			t.Fatalf("multiplyCreditsByRatioCeil(101, %v) = %d, want %d", tc.ratio, got, tc.want)
		}
	}
}

func TestActualTierUsesReportedTierAndFallsBackToRequested(t *testing.T) {
	if got, confirmed := ActualTier(TierFast, map[string]interface{}{"actual_service_tier": "default"}); got != TierStandard || !confirmed {
		t.Fatalf("ActualTier(default) = %q, %v", got, confirmed)
	}
	if got, confirmed := ActualTier(TierFast, map[string]interface{}{"actual_speed": "fast"}); got != TierFast || !confirmed {
		t.Fatalf("ActualTier(fast) = %q, %v", got, confirmed)
	}
	if got, confirmed := ActualTier(TierFast, nil); got != TierFast || confirmed {
		t.Fatalf("ActualTier(fallback) = %q, %v", got, confirmed)
	}
}
