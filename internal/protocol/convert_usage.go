package protocol

// NormalizeUsage extracts {prompt_tokens, completion_tokens} from a raw
// upstream response according to the source protocol.
func NormalizeUsage(resp map[string]interface{}, sourceProtocol string) map[string]interface{} {
	switch sourceProtocol {
	case ProtocolClaude:
		if usg, ok := resp["usage"].(map[string]interface{}); ok {
			in, _ := usg["input_tokens"].(float64)
			out, _ := usg["output_tokens"].(float64)
			cacheCreate, _ := usg["cache_creation_input_tokens"].(float64)
			cacheRead, _ := usg["cache_read_input_tokens"].(float64)
			result := map[string]interface{}{
				"prompt_tokens":     int64(in),
				"completion_tokens": int64(out),
				"total_tokens":      int64(in + out),
			}
			if cacheCreate > 0 {
				result["cache_creation_tokens"] = int64(cacheCreate)
			}
			if cacheRead > 0 {
				result["cache_read_tokens"] = int64(cacheRead)
			}
			if speed, _ := usg["speed"].(string); speed != "" {
				result["actual_speed"] = speed
			}
			return result
		}
	case ProtocolGemini:
		if meta, ok := resp["usageMetadata"].(map[string]interface{}); ok {
			in, _ := meta["promptTokenCount"].(float64)
			out, _ := meta["candidatesTokenCount"].(float64)
			thoughts, _ := meta["thoughtsTokenCount"].(float64)
			cacheRead, _ := meta["cachedContentTokenCount"].(float64)
			totalOut := out + thoughts
			result := map[string]interface{}{
				"prompt_tokens":     int64(in),
				"completion_tokens": int64(totalOut),
				"total_tokens":      int64(in + totalOut),
			}
			if cacheRead > 0 {
				result["cache_read_tokens"] = int64(cacheRead)
			}
			return result
		}
	case ProtocolResponses:
		if usg, ok := resp["usage"].(map[string]interface{}); ok {
			in, _ := usg["input_tokens"].(float64)
			out, _ := usg["output_tokens"].(float64)
			result := map[string]interface{}{
				"prompt_tokens":     int64(in),
				"completion_tokens": int64(out),
				"total_tokens":      int64(in + out),
			}
			// OpenAI Responses prompt caching: input_tokens_details.cached_tokens
			if details, ok := usg["input_tokens_details"].(map[string]interface{}); ok {
				if n, _ := details["cached_tokens"].(float64); n > 0 {
					result["cache_read_tokens"] = int64(n)
				}
			}
			if serviceTier, _ := resp["service_tier"].(string); serviceTier != "" {
				result["actual_service_tier"] = serviceTier
			}
			return result
		}
	default:
		if usg, ok := resp["usage"].(map[string]interface{}); ok {
			pt, _ := usg["prompt_tokens"].(float64)
			ct, _ := usg["completion_tokens"].(float64)
			result := map[string]interface{}{
				"prompt_tokens":     int64(pt),
				"completion_tokens": int64(ct),
				"total_tokens":      int64(pt + ct),
			}
			// OpenAI prompt caching: prompt_tokens_details.cached_tokens
			if details, ok := usg["prompt_tokens_details"].(map[string]interface{}); ok {
				if n, _ := details["cached_tokens"].(float64); n > 0 {
					result["cache_read_tokens"] = int64(n)
				}
			}
			if serviceTier, _ := resp["service_tier"].(string); serviceTier != "" {
				result["actual_service_tier"] = serviceTier
			}
			return result
		}
	}
	return nil
}
