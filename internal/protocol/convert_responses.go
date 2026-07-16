package protocol

import (
	"encoding/json"
	"strings"
)

// openAIToResponsesRequest converts an OpenAI chat/completions request to
// OpenAI Responses API request format.
func openAIToResponsesRequest(req map[string]interface{}) (map[string]interface{}, error) {
	out := make(map[string]interface{})

	if m, ok := req["model"].(string); ok {
		out["model"] = m
	}
	if s, ok := req["stream"]; ok {
		out["stream"] = s
	}
	if serviceTier, ok := req["service_tier"]; ok {
		out["service_tier"] = serviceTier
	}
	if mt, ok := req["max_tokens"]; ok {
		out["max_output_tokens"] = mt
	} else if mt, ok := req["max_completion_tokens"]; ok {
		out["max_output_tokens"] = mt
	}
	if t, ok := req["temperature"]; ok {
		out["temperature"] = t
	}
	if tp, ok := req["top_p"]; ok {
		out["top_p"] = tp
	}

	var instructions []string
	input := make([]interface{}, 0)

	if msgs, ok := req["messages"].([]interface{}); ok {
		for _, m := range msgs {
			msg, ok := m.(map[string]interface{})
			if !ok {
				continue
			}
			role, _ := msg["role"].(string)
			if role == "" {
				role = "user"
			}

			if role == "system" {
				switch c := msg["content"].(type) {
				case string:
					if c != "" {
						instructions = append(instructions, c)
					}
				case []interface{}:
					var sb strings.Builder
					for _, p := range c {
						pm, ok := p.(map[string]interface{})
						if !ok {
							continue
						}
						if text, _ := pm["text"].(string); text != "" {
							sb.WriteString(text)
						}
					}
					if sb.Len() > 0 {
						instructions = append(instructions, sb.String())
					}
				}
				continue
			}

			item := map[string]interface{}{"role": role}
			switch c := msg["content"].(type) {
			case string:
				item["content"] = c
			case []interface{}:
				parts := make([]interface{}, 0)
				for _, p := range c {
					pm, ok := p.(map[string]interface{})
					if !ok {
						continue
					}
					pType, _ := pm["type"].(string)
					switch pType {
					case "text":
						if text, _ := pm["text"].(string); text != "" {
							parts = append(parts, map[string]interface{}{
								"type": "input_text",
								"text": text,
							})
						}
					case "image_url":
						// OpenAI image_url part → Responses API input_image part.
						// OpenAI format: {"type":"image_url","image_url":{"url":"..."}}
						// Responses API: {"type":"input_image","image_url":"..."}
						var imageURL string
						switch iv := pm["image_url"].(type) {
						case map[string]interface{}:
							imageURL, _ = iv["url"].(string)
						case string:
							imageURL = iv
						}
						if imageURL != "" {
							parts = append(parts, map[string]interface{}{
								"type":      "input_image",
								"image_url": imageURL,
							})
						}
					default:
						parts = append(parts, pm)
					}
				}
				item["content"] = parts
			default:
				item["content"] = c
			}
			input = append(input, item)
		}
	}

	if len(instructions) > 0 {
		out["instructions"] = strings.Join(instructions, "\n\n")
	}
	if len(input) > 0 {
		out["input"] = input
	}

	if tools, ok := req["tools"].([]interface{}); ok && len(tools) > 0 {
		out["tools"] = convertOpenAIToolsToResponses(tools)
	}

	return out, nil
}

func convertOpenAIToolsToResponses(tools []interface{}) []map[string]interface{} {
	var out []map[string]interface{}
	for _, raw := range tools {
		tm, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if tm["type"] != "function" {
			out = append(out, tm)
			continue
		}
		fn, _ := tm["function"].(map[string]interface{})
		if fn == nil {
			out = append(out, tm)
			continue
		}
		tool := map[string]interface{}{
			"type": "function",
			"name": fn["name"],
		}
		if desc, ok := fn["description"]; ok {
			tool["description"] = desc
		}
		if params, ok := fn["parameters"]; ok {
			tool["parameters"] = params
		}
		if strict, ok := fn["strict"]; ok {
			tool["strict"] = strict
		} else if strict, ok := tm["strict"]; ok {
			tool["strict"] = strict
		}
		out = append(out, tool)
	}
	return out
}

// responsesToOpenAI converts an OpenAI Responses API request to OpenAI chat/completions format.
// Responses API fields: model, input (string | array), instructions, stream, max_output_tokens, tools
func responsesToOpenAI(req map[string]interface{}) (map[string]interface{}, error) {
	out := make(map[string]interface{})

	if m, ok := req["model"].(string); ok {
		out["model"] = m
	}
	if s, ok := req["stream"]; ok {
		out["stream"] = s
	}
	if serviceTier, ok := req["service_tier"]; ok {
		out["service_tier"] = serviceTier
	}
	if mt, ok := req["max_output_tokens"]; ok {
		out["max_tokens"] = mt
	} else if mt, ok := req["max_tokens"]; ok {
		out["max_tokens"] = mt
	} else if mt, ok := req["max_completion_tokens"]; ok {
		out["max_tokens"] = mt
	}
	if t, ok := req["temperature"]; ok {
		out["temperature"] = t
	}
	if tp, ok := req["top_p"]; ok {
		out["top_p"] = tp
	}
	if tc, ok := req["tool_choice"]; ok {
		out["tool_choice"] = tc
	}

	var messages []interface{}
	instructions, _ := req["instructions"].(string)

	if msgs, ok := req["messages"].([]interface{}); ok && len(msgs) > 0 {
		messages = append(messages, msgs...)
		if strings.TrimSpace(instructions) != "" && !hasEquivalentSystemMessage(messages, instructions) {
			messages = append([]interface{}{
				map[string]interface{}{
					"role":    "system",
					"content": instructions,
				},
			}, messages...)
		}
	} else {
		// instructions → system message
		if instructions != "" {
			messages = append(messages, map[string]interface{}{
				"role":    "system",
				"content": instructions,
			})
		}

		// input: string | array of content items
		switch inp := req["input"].(type) {
		case string:
			messages = append(messages, map[string]interface{}{
				"role":    "user",
				"content": inp,
			})
		case []interface{}:
			for _, item := range inp {
				im, ok := item.(map[string]interface{})
				if !ok {
					continue
				}
				itemType, _ := im["type"].(string)
				switch itemType {
				case "function_call_output":
					callID, _ := im["call_id"].(string)
					if callID == "" {
						callID, _ = im["id"].(string)
					}
					messages = append(messages, map[string]interface{}{
						"role":         "tool",
						"tool_call_id": callID,
						"content":      responsesStringValue(im["output"]),
					})
					continue
				case "function_call":
					callID, _ := im["call_id"].(string)
					if callID == "" {
						callID, _ = im["id"].(string)
					}
					name, _ := im["name"].(string)
					arguments, _ := im["arguments"].(string)
					messages = append(messages, map[string]interface{}{
						"role":    "assistant",
						"content": nil,
						"tool_calls": []interface{}{map[string]interface{}{
							"id":   callID,
							"type": "function",
							"function": map[string]interface{}{
								"name":      name,
								"arguments": arguments,
							},
						}},
					})
					continue
				case "reasoning":
					continue
				}

				role, _ := im["role"].(string)
				if role == "" {
					role = "user"
				}
				switch c := im["content"].(type) {
				case string:
					messages = append(messages, map[string]interface{}{
						"role":    role,
						"content": c,
					})
				case []interface{}:
					// content parts: {type: "input_text"|"output_text", text: "..."}
					var parts []map[string]interface{}
					var simpleText string
					allText := true
					for _, cp := range c {
						cpm, ok := cp.(map[string]interface{})
						if !ok {
							continue
						}
						text, _ := cpm["text"].(string)
						t, _ := cpm["type"].(string)
						if t == "input_text" || t == "output_text" || t == "text" {
							simpleText += text
							parts = append(parts, map[string]interface{}{"type": "text", "text": text})
						} else {
							allText = false
							parts = append(parts, cpm)
						}
					}
					if allText {
						messages = append(messages, map[string]interface{}{
							"role":    role,
							"content": simpleText,
						})
					} else {
						messages = append(messages, map[string]interface{}{
							"role":    role,
							"content": parts,
						})
					}
				}
			}
		}
	}

	out["messages"] = messages

	// tools: Responses API function tools are flat; Chat Completions expects nested function metadata.
	if tools, ok := req["tools"].([]interface{}); ok && len(tools) > 0 {
		out["tools"] = convertResponsesToolsToOpenAI(tools)
	}

	return out, nil
}

func convertResponsesToolsToOpenAI(tools []interface{}) []map[string]interface{} {
	var out []map[string]interface{}
	for _, raw := range tools {
		tm, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if tm["type"] != "function" {
			out = append(out, tm)
			continue
		}
		if _, ok := tm["function"].(map[string]interface{}); ok {
			out = append(out, tm)
			continue
		}
		fn := map[string]interface{}{
			"name": tm["name"],
		}
		if desc, ok := tm["description"]; ok {
			fn["description"] = desc
		}
		if params, ok := tm["parameters"]; ok {
			fn["parameters"] = params
		}
		if strict, ok := tm["strict"]; ok {
			fn["strict"] = strict
		}
		out = append(out, map[string]interface{}{
			"type":     "function",
			"function": fn,
		})
	}
	return out
}

func responsesStringValue(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case nil:
		return ""
	default:
		b, _ := json.Marshal(val)
		return string(b)
	}
}

func hasEquivalentSystemMessage(messages []interface{}, instructions string) bool {
	want := strings.TrimSpace(instructions)
	if want == "" {
		return true
	}
	for _, m := range messages {
		msg, ok := m.(map[string]interface{})
		if !ok {
			continue
		}
		if role, _ := msg["role"].(string); role != "system" {
			continue
		}
		switch c := msg["content"].(type) {
		case string:
			if strings.TrimSpace(c) == want {
				return true
			}
		case []interface{}:
			var sb strings.Builder
			for _, p := range c {
				pm, ok := p.(map[string]interface{})
				if !ok {
					continue
				}
				if text, _ := pm["text"].(string); text != "" {
					sb.WriteString(text)
				}
			}
			if strings.TrimSpace(sb.String()) == want {
				return true
			}
		}
	}
	return false
}

// openAIToResponsesSync converts an OpenAI chat.completion response to Responses API format.
func openAIToResponsesSync(body []byte) ([]byte, error) {
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		return body, nil
	}

	id, _ := resp["id"].(string)
	model, _ := resp["model"].(string)

	var text string
	output := make([]interface{}, 0)
	if choices, ok := resp["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if msg, ok := choice["message"].(map[string]interface{}); ok {
				text, _ = msg["content"].(string)
				if text != "" {
					output = append(output, map[string]interface{}{
						"type":   "message",
						"id":     id,
						"status": "completed",
						"role":   "assistant",
						"content": []interface{}{
							map[string]interface{}{
								"type": "output_text",
								"text": text,
							},
						},
					})
				}
				if toolCalls, ok := msg["tool_calls"].([]interface{}); ok {
					for _, raw := range toolCalls {
						tc, ok := raw.(map[string]interface{})
						if !ok {
							continue
						}
						callID, _ := tc["id"].(string)
						fn, _ := tc["function"].(map[string]interface{})
						name, _ := fn["name"].(string)
						arguments, _ := fn["arguments"].(string)
						output = append(output, map[string]interface{}{
							"type":      "function_call",
							"id":        "fc_" + newShortID(),
							"status":    "completed",
							"call_id":   callID,
							"name":      name,
							"arguments": arguments,
						})
					}
				}
			}
		}
	}

	inputTokens := int64(0)
	outputTokens := int64(0)
	if usg, ok := resp["usage"].(map[string]interface{}); ok {
		if pt, ok := usg["prompt_tokens"].(float64); ok {
			inputTokens = int64(pt)
		}
		if ct, ok := usg["completion_tokens"].(float64); ok {
			outputTokens = int64(ct)
		}
	}

	out := map[string]interface{}{
		"id":         id,
		"object":     "response",
		"created_at": resp["created"],
		"model":      model,
		"status":     "completed",
		"output":     output,
		"usage": map[string]interface{}{
			"input_tokens":  inputTokens,
			"output_tokens": outputTokens,
		},
	}
	if serviceTier, _ := resp["service_tier"].(string); serviceTier != "" {
		out["service_tier"] = serviceTier
	}
	return json.Marshal(out)
}

// responsesToOpenAISync converts an OpenAI Responses API sync response to
// OpenAI chat/completions format.
func responsesToOpenAISync(body []byte) ([]byte, error) {
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		return body, nil
	}

	id, _ := resp["id"].(string)
	modelName, _ := resp["model"].(string)

	var textBuilder strings.Builder
	if output, ok := resp["output"].([]interface{}); ok {
		for _, item := range output {
			im, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			content, _ := im["content"].([]interface{})
			for _, part := range content {
				pm, ok := part.(map[string]interface{})
				if !ok {
					continue
				}
				partType, _ := pm["type"].(string)
				if partType == "output_text" || partType == "text" || partType == "input_text" {
					if t, _ := pm["text"].(string); t != "" {
						textBuilder.WriteString(t)
					}
				}
			}
		}
	}

	promptTokens := int64(0)
	completionTokens := int64(0)
	if usg, ok := resp["usage"].(map[string]interface{}); ok {
		if pt, ok := usg["input_tokens"].(float64); ok {
			promptTokens = int64(pt)
		}
		if ct, ok := usg["output_tokens"].(float64); ok {
			completionTokens = int64(ct)
		}
	}

	out := map[string]interface{}{
		"id":      id,
		"object":  "chat.completion",
		"created": resp["created_at"],
		"model":   modelName,
		"choices": []interface{}{
			map[string]interface{}{
				"index": 0,
				"message": map[string]interface{}{
					"role":    "assistant",
					"content": textBuilder.String(),
				},
				"finish_reason": "stop",
			},
		},
		"usage": map[string]interface{}{
			"prompt_tokens":     promptTokens,
			"completion_tokens": completionTokens,
			"total_tokens":      promptTokens + completionTokens,
		},
	}
	if serviceTier, _ := resp["service_tier"].(string); serviceTier != "" {
		out["service_tier"] = serviceTier
	}

	return json.Marshal(out)
}
