package billing

import (
	"fanapi/internal/model"
	"fmt"
	"math"
	"strings"
)

const GPTShortContextLimit int64 = 272000

// ContextPricingConfig applies whole-request rates to an immutable copy.
// The configured prices are always short-context prices, in internal credits.
func ContextPricingConfig(cfg map[string]interface{}, inputTokens int64) map[string]interface{} {
	if !getBool(cfg, "gpt_context_pricing") || inputTokens <= ContextInputLimit(cfg) {
		return cfg
	}
	out := cloneConfigMap(cfg)
	for _, keys := range [][]string{priceRatioKeys, costRatioKeys} {
		for _, key := range keys {
			if _, exists := cfg[key]; !exists {
				continue
			}
			ratio := 2.0
			if key == "output_price_per_1m_tokens" || key == "output_cost_per_1m_tokens" {
				ratio = 1.5
			}
			out[key] = multiplyCreditsByRatioCeil(getInt64Val(cfg, key), ratio)
		}
	}
	return out
}

// GPTUsageInputTokens accepts both normalized usage and raw Responses usage.
func GPTUsageInputTokens(usage map[string]interface{}) (int64, bool) {
	for _, key := range []string{"input_tokens", "prompt_tokens"} {
		if raw, exists := usage[key]; exists {
			n, err := ToInt64(raw)
			return n, err == nil && n >= 0
		}
	}
	return 0, false
}

func calcGPTContextCost(cfg map[string]interface{}, resp map[string]interface{}, upstream bool) (int64, error) {
	usage, _ := resp["usage"].(map[string]interface{})
	input, ok := GPTUsageInputTokens(usage)
	if !ok {
		return 0, fmt.Errorf("GPT context pricing requires actual input token usage")
	}
	cfg = ContextPricingConfig(cfg, input)
	output := getInt64Val(usage, "completion_tokens")
	if _, exists := usage["output_tokens"]; exists {
		output = getInt64Val(usage, "output_tokens")
	}
	read := getInt64Val(usage, "cache_read_tokens")
	write := getInt64Val(usage, "cache_creation_tokens")
	for _, key := range []string{"input_tokens_details", "prompt_tokens_details"} {
		if details, ok := usage[key].(map[string]interface{}); ok {
			if _, exists := details["cached_tokens"]; exists {
				read = getInt64Val(details, "cached_tokens")
			}
		}
	}
	if input < 0 || output < 0 || read < 0 || write < 0 || read > input || write > input-read {
		return 0, fmt.Errorf("invalid GPT token usage: cache tokens must be disjoint subsets of input")
	}
	kind := "price"
	if upstream {
		kind = "cost"
	}
	inputRate := getInt64Val(cfg, "input_"+kind+"_per_1m_tokens")
	outputRate := getInt64Val(cfg, "output_"+kind+"_per_1m_tokens")
	readRate := getInt64Val(cfg, "cache_read_"+kind+"_per_1m_tokens")
	writeRate := getInt64Val(cfg, "cache_creation_"+kind+"_per_1m_tokens")
	// Explicit zero is a valid rate; only absent cache prices use defaults.
	if _, exists := cfg["cache_read_"+kind+"_per_1m_tokens"]; !exists {
		readRate = multiplyCreditsByRatioCeil(inputRate, 0.1)
	}
	if _, exists := cfg["cache_creation_"+kind+"_per_1m_tokens"]; !exists {
		writeRate = multiplyCreditsByRatioCeil(inputRate, 1.25)
	}
	// Preserve the existing per-component credit rounding convention.
	cost := func(tokens, rate int64) int64 {
		return int64(math.Ceil(float64(tokens) * float64(rate) / 1000000))
	}
	return cost(input-read-write, inputRate) + cost(read, readRate) + cost(write, writeRate) + cost(output, outputRate), nil
}

// ChannelContextConfig applies MIDCODE's explicitly selected Sol 6.1 policy.
// This is a platform rule, not a claim about official API pricing.
func ChannelContextConfig(ch *model.Channel) map[string]interface{} {
	cfg := map[string]interface{}(ch.BillingConfig)
	if strings.EqualFold(strings.TrimSpace(ch.Model), "gpt-6.1-sol") {
		cfg = cloneConfigMap(cfg)
		cfg["context_input_limit"] = int64(500000)
	}
	return cfg
}

func ContextInputLimit(cfg map[string]interface{}) int64 {
	if n := getInt64Val(cfg, "context_input_limit"); n > 0 {
		return n
	}
	return GPTShortContextLimit
}
