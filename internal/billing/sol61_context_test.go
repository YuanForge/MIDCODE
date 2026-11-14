package billing

import (
	"fanapi/internal/model"
	"testing"
)

func TestSol61ContextBoundaries(t *testing.T) {
	for _, name := range []string{"gpt-6.1-sol", "gpt-6-sol"} {
		ch := &model.Channel{Model: name, Protocol: "responses", BillingType: "token", BillingConfig: model.JSON{
			"gpt_context_pricing": true, "input_from_response": true,
			"input_price_per_1m_tokens": int64(1000000), "output_price_per_1m_tokens": int64(2000000),
			"cache_read_price_per_1m_tokens": int64(100000),
			"input_cost_per_1m_tokens":       int64(1000000), "output_cost_per_1m_tokens": int64(2000000),
			"cache_read_cost_per_1m_tokens": int64(100000),
		}}
		for _, n := range []int64{272000, 272001, 353287, 500000, 500001} {
			for _, cached := range []int64{0, n - 1} {
				limit := int64(272000)
				if name == "gpt-6.1-sol" {
					limit = 500000
				}
				in, out, read := int64(1000000), int64(2000000), int64(100000)
				if n > limit {
					in *= 2
					out = out * 3 / 2
					read *= 2
				}
				ceil := func(a, b int64) int64 { return (a*b + 999999) / 1000000 }
				want := ceil(n-cached, in) + ceil(cached, read) + ceil(100, out)
				resp := map[string]interface{}{"usage": map[string]interface{}{"prompt_tokens": n, "completion_tokens": int64(100), "cache_read_tokens": cached}}
				got, err := CalcActualCost(ch, nil, resp)
				if err != nil || got != want {
					t.Fatalf("%s n=%d cache=%d sale=%d want=%d err=%v", name, n, cached, got, want, err)
				}
				got, err = CalcActualUpstreamCost(ch, nil, resp)
				if err != nil || got != want {
					t.Fatalf("%s n=%d cost=%d want=%d err=%v", name, n, got, want, err)
				}
			}
		}
		if _, ok := ch.BillingConfig["context_input_limit"]; ok {
			t.Fatal("mutated shared channel configuration")
		}
	}
}
