package handler

import (
	"encoding/json"
	"testing"

	"fanapi/internal/billing"
	"fanapi/internal/model"
	"fanapi/internal/protocol"
)

func TestGPTContextBillingAcrossTransports(t *testing.T) {
	for _, responses := range []bool{false, true} {
		usage := map[string]interface{}{
			"cache_creation_tokens": float64(50000),
		}
		proto := protocol.ProtocolOpenAI
		if responses {
			proto = protocol.ProtocolResponses
			usage["input_tokens"] = float64(300000)
			usage["output_tokens"] = float64(1000)
			usage["input_tokens_details"] = map[string]interface{}{"cached_tokens": float64(200000)}
		} else {
			usage["prompt_tokens"] = float64(300000)
			usage["completion_tokens"] = float64(1000)
			usage["prompt_tokens_details"] = map[string]interface{}{"cached_tokens": float64(200000)}
		}
		resp := map[string]interface{}{"usage": usage}
		usages := []map[string]interface{}{protocol.NormalizeUsage(resp, proto)}
		event := resp
		if responses {
			usages = append(usages, responsesUsageFromEvent(resp))
			event = map[string]interface{}{"type": "response.completed", "response": resp}
		}
		payload, _ := json.Marshal(event)
		state := &usageState{protocol: protocolOpenAI}
		state.processLine("data: " + string(payload))
		usages = append(usages, state.normalized(nil))
		ch := &model.Channel{BillingType: "token", Protocol: proto, BillingConfig: model.JSON{
			"gpt_context_pricing":                true,
			"input_price_per_1m_tokens":          int64(10000000),
			"output_price_per_1m_tokens":         int64(50000000),
			"cache_read_price_per_1m_tokens":     int64(1000000),
			"cache_creation_price_per_1m_tokens": int64(12500000),
		}}
		for _, normalized := range usages {
			got, err := billing.CalcActualCost(ch, nil, map[string]interface{}{"usage": normalized})
			if err != nil || got != 2725000 {
				t.Fatalf("protocol=%s usage=%v cost=%d err=%v", proto, normalized, got, err)
			}
		}
	}
}
