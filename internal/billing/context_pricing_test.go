package billing

import (
	"testing"

	"fanapi/internal/model"
)

func contextTestChannel() *model.Channel {
	cfg := model.JSON{"gpt_context_pricing": true, "fast_ratio": 2.0}
	for _, kind := range []string{"price", "cost"} {
		cfg["input_"+kind+"_per_1m_tokens"] = int64(10000000)
		cfg["output_"+kind+"_per_1m_tokens"] = int64(50000000)
		cfg["cache_read_"+kind+"_per_1m_tokens"] = int64(1000000)
		cfg["cache_creation_"+kind+"_per_1m_tokens"] = int64(12500000)
	}
	return &model.Channel{BillingType: "token", Protocol: "responses", BillingConfig: cfg}
}

func TestGPTContextPricing(t *testing.T) {
	for _, tc := range []struct {
		name                             string
		input, output, read, write, want int64
	}{
		{"short with large output", 260000, 20000, 0, 0, 3600000},
		{"boundary", 272000, 1000, 0, 0, 2770000},
		{"boundary plus one", 272001, 1000, 0, 0, 5515020},
		{"long", 280000, 1000, 0, 0, 5675000},
		{"cached counts toward threshold", 300000, 0, 250000, 0, 1500000},
		{"cache writes are disjoint", 300000, 1000, 200000, 50000, 2725000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ch := contextTestChannel()
			resp := map[string]interface{}{"usage": map[string]interface{}{
				"prompt_tokens": tc.input, "completion_tokens": tc.output,
				"cache_read_tokens": tc.read, "cache_creation_tokens": tc.write,
			}}
			// A client-supplied count must never override response usage.
			req := map[string]interface{}{"input_tokens": int64(1)}
			got, err := CalcActualCost(ch, req, resp)
			if err != nil || got != tc.want {
				t.Fatalf("sale=%d err=%v want=%d", got, err, tc.want)
			}
			got, err = CalcActualUpstreamCost(ch, req, resp)
			if err != nil || got != tc.want {
				t.Fatalf("cost=%d err=%v want=%d", got, err, tc.want)
			}
			if ch.BillingConfig["input_price_per_1m_tokens"] != int64(10000000) {
				t.Fatal("mutated channel prices")
			}
		})
	}
}

func TestGPTContextRawResponsesVIPFastAndHold(t *testing.T) {
	ch := contextTestChannel()
	RegisterVIPDiscountLookup(func(string) int64 { return 5000 })
	t.Cleanup(func() { RegisterVIPDiscountLookup(nil) })
	resp := map[string]interface{}{"usage": map[string]interface{}{
		"input_tokens": int64(300000), "output_tokens": int64(1000),
		"input_tokens_details": map[string]interface{}{"cached_tokens": int64(250000)},
	}}
	got, err := CalcActualCostForUserWithTier(ch, nil, resp, "vip", TierFast)
	if err != nil || got != 1575000 {
		t.Fatalf("sale=%d err=%v", got, err)
	}
	got, err = CalcActualUpstreamCostWithTier(ch, nil, resp, TierFast)
	if err != nil || got != 3150000 {
		t.Fatalf("cost=%d err=%v", got, err)
	}
	hold, _, err := Calc(ch, map[string]interface{}{"input_tokens": int64(300000)})
	if err != nil || hold != 6000000 {
		t.Fatalf("hold=%d err=%v", hold, err)
	}
}

func TestGPTContextDisabledAndInvalidUsage(t *testing.T) {
	ch := contextTestChannel()
	ch.BillingConfig["gpt_context_pricing"] = false
	resp := map[string]interface{}{"usage": map[string]interface{}{"prompt_tokens": int64(300000), "completion_tokens": int64(1000)}}
	got, err := CalcActualCost(ch, nil, resp)
	if err != nil || got != 3050000 {
		t.Fatalf("disabled sale=%d err=%v", got, err)
	}
	ch.BillingConfig["gpt_context_pricing"] = true
	for _, usage := range []map[string]interface{}{
		{}, {"prompt_tokens": int64(10), "cache_read_tokens": int64(11)},
		{"prompt_tokens": int64(10), "cache_read_tokens": int64(5), "cache_creation_tokens": int64(6)},
	} {
		if _, err := CalcActualCost(ch, nil, map[string]interface{}{"usage": usage}); err == nil {
			t.Fatalf("accepted invalid usage %v", usage)
		}
	}
}
