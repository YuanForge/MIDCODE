package protocol

import (
	"encoding/json"
	"sort"
	"strings"
)

type geminiStreamCall struct{ name, arguments string }
type openAIToGeminiSSE struct {
	calls map[int]map[int]*geminiStreamCall
}

func (g *openAIToGeminiSSE) Convert(line string) []string {
	if !strings.HasPrefix(line, "data:") {
		return nil
	}
	payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
	if payload == "[DONE]" {
		return nil
	}
	var chunk map[string]interface{}
	if json.Unmarshal([]byte(payload), &chunk) != nil {
		return nil
	}
	out := map[string]interface{}{}
	if err, ok := chunk["error"]; ok {
		out["error"] = err
	}
	if model, ok := chunk["model"].(string); ok && model != "" {
		out["modelVersion"] = model
	}
	var candidates []interface{}
	choices, _ := chunk["choices"].([]interface{})
	for _, value := range choices {
		choice, ok := value.(map[string]interface{})
		if !ok {
			continue
		}
		index := intFromJSON(choice["index"])
		delta, _ := choice["delta"].(map[string]interface{})
		var parts []interface{}
		if text, _ := delta["content"].(string); text != "" {
			parts = append(parts, map[string]interface{}{"text": text})
		}
		if text, _ := delta["reasoning_content"].(string); text != "" {
			parts = append(parts, map[string]interface{}{"text": text, "thought": true})
		}
		if tools, ok := delta["tool_calls"].([]interface{}); ok {
			if g.calls == nil {
				g.calls = map[int]map[int]*geminiStreamCall{}
			}
			if g.calls[index] == nil {
				g.calls[index] = map[int]*geminiStreamCall{}
			}
			for _, raw := range tools {
				tool, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}
				i := intFromJSON(tool["index"])
				call := g.calls[index][i]
				if call == nil {
					call = &geminiStreamCall{}
					g.calls[index][i] = call
				}
				fn, _ := tool["function"].(map[string]interface{})
				if name, _ := fn["name"].(string); name != "" {
					call.name += name
				}
				if args, _ := fn["arguments"].(string); args != "" {
					call.arguments += args
				}
			}
		}
		finish, _ := choice["finish_reason"].(string)
		candidate := map[string]interface{}{"index": index}
		if finish != "" {
			indices := []int{}
			for i := range g.calls[index] {
				indices = append(indices, i)
			}
			sort.Ints(indices)
			for _, i := range indices {
				call := g.calls[index][i]
				args := map[string]interface{}{}
				if call.arguments != "" && json.Unmarshal([]byte(call.arguments), &args) != nil {
					return geminiSSEEvent(map[string]interface{}{"error": map[string]interface{}{"code": 502, "status": "INTERNAL", "message": "Invalid streamed function arguments"}})
				}
				parts = append(parts, map[string]interface{}{"functionCall": map[string]interface{}{"name": call.name, "args": args}})
			}
			delete(g.calls, index)
			reason := "STOP"
			if finish == "length" {
				reason = "MAX_TOKENS"
			}
			if finish == "content_filter" {
				reason = "SAFETY"
			}
			candidate["finishReason"] = reason
		}
		if len(parts) > 0 {
			candidate["content"] = map[string]interface{}{"role": "model", "parts": parts}
		}
		if len(parts) > 0 || finish != "" {
			candidates = append(candidates, candidate)
		}
	}
	if len(candidates) > 0 {
		out["candidates"] = candidates
	}
	if usage, ok := chunk["usage"].(map[string]interface{}); ok {
		in, completion := intFromJSON(usage["prompt_tokens"]), intFromJSON(usage["completion_tokens"])
		total := intFromJSON(usage["total_tokens"])
		if total == 0 {
			total = in + completion
		}
		meta := map[string]interface{}{"promptTokenCount": in, "candidatesTokenCount": completion, "totalTokenCount": total}
		if details, ok := usage["prompt_tokens_details"].(map[string]interface{}); ok {
			meta["cachedContentTokenCount"] = intFromJSON(details["cached_tokens"])
		}
		if details, ok := usage["completion_tokens_details"].(map[string]interface{}); ok {
			thoughts := intFromJSON(details["reasoning_tokens"])
			meta["thoughtsTokenCount"] = thoughts
			if completion >= thoughts {
				meta["candidatesTokenCount"] = completion - thoughts
			}
		}
		out["usageMetadata"] = meta
	}
	if out["candidates"] == nil && out["usageMetadata"] == nil && out["error"] == nil {
		return nil
	}
	return geminiSSEEvent(out)
}

func geminiSSEEvent(value map[string]interface{}) []string {
	b, _ := json.Marshal(value)
	return []string{"data: " + string(b), ""}
}

// Gemini SSE ends at EOF, not with OpenAI's [DONE] sentinel.
func (g *openAIToGeminiSSE) Flush() []string { return nil }
