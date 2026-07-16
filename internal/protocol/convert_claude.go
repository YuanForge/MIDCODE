package protocol

import (
	"encoding/json"
	"fmt"
	"strings"
)

func openAIToClaude(req map[string]interface{}) (map[string]interface{}, error) {
	out := make(map[string]interface{})

	if m, ok := req["model"].(string); ok {
		out["model"] = m
	}

	// max_tokens (Claude requires this field)
	if mt, ok := req["max_tokens"]; ok {
		out["max_tokens"] = mt
	} else if mc, ok := req["max_completion_tokens"]; ok {
		out["max_tokens"] = mc
	} else {
		out["max_tokens"] = 4096
	}

	if t, ok := req["temperature"]; ok {
		out["temperature"] = t
	}
	if tp, ok := req["top_p"]; ok {
		out["top_p"] = tp
	}
	if s, ok := req["stream"]; ok {
		out["stream"] = s
	}
	if speed, ok := req["speed"]; ok {
		out["speed"] = speed
	}

	// system + messages
	messages, _ := req["messages"].([]interface{})
	var systemMsg string
	var claudeMessages []map[string]interface{}

	for _, m := range messages {
		msg, ok := m.(map[string]interface{})
		if !ok {
			continue
		}
		role, _ := msg["role"].(string)
		switch role {
		case "system":
			if c, ok := msg["content"].(string); ok {
				if systemMsg != "" {
					systemMsg += "\n"
				}
				systemMsg += c
			}
		case "user", "assistant":
			claudeMsg := map[string]interface{}{"role": role}
			switch c := msg["content"].(type) {
			case string:
				claudeMsg["content"] = []map[string]interface{}{
					{"type": "text", "text": c},
				}
			case []interface{}:
				var parts []map[string]interface{}
				for _, p := range c {
					pm, ok := p.(map[string]interface{})
					if !ok {
						continue
					}
					parts = append(parts, convertOpenAIContentPartToClaude(pm))
				}
				claudeMsg["content"] = parts
			default:
				claudeMsg["content"] = msg["content"]
			}
			claudeMessages = append(claudeMessages, claudeMsg)
		case "tool":
			// tool result
			toolCallID, _ := msg["tool_call_id"].(string)
			content, _ := msg["content"].(string)
			claudeMessages = append(claudeMessages, map[string]interface{}{
				"role": "user",
				"content": []map[string]interface{}{
					{
						"type":        "tool_result",
						"tool_use_id": toolCallID,
						"content":     content,
					},
				},
			})
		}
	}

	if len(claudeMessages) == 0 {
		return nil, fmt.Errorf("no valid messages after conversion")
	}
	if systemMsg != "" {
		out["system"] = systemMsg
	}
	out["messages"] = claudeMessages

	// tools
	if tools, ok := req["tools"].([]interface{}); ok && len(tools) > 0 {
		out["tools"] = convertOpenAIToolsToClaude(tools)
	}

	// tool_choice
	if tc, ok := req["tool_choice"]; ok {
		out["tool_choice"] = convertToolChoiceToClaude(tc)
	}

	return out, nil
}

func convertOpenAIToolsToClaude(tools []interface{}) []map[string]interface{} {
	var out []map[string]interface{}
	for _, t := range tools {
		tm, ok := t.(map[string]interface{})
		if !ok {
			continue
		}
		if tm["type"] != "function" {
			continue
		}
		fn, _ := tm["function"].(map[string]interface{})
		if fn == nil {
			continue
		}
		tool := map[string]interface{}{
			"name": fn["name"],
		}
		if desc, ok := fn["description"].(string); ok {
			tool["description"] = desc
		}
		if params, ok := fn["parameters"]; ok {
			tool["input_schema"] = params
		}
		out = append(out, tool)
	}
	return out
}

func convertToolChoiceToClaude(tc interface{}) interface{} {
	switch v := tc.(type) {
	case string:
		switch v {
		case "auto":
			return map[string]interface{}{"type": "auto"}
		case "none":
			// Claude 没有 none 等价项，用 auto 并不强制调用工具
			return map[string]interface{}{"type": "auto"}
		case "required":
			return map[string]interface{}{"type": "any"}
		}
		return map[string]interface{}{"type": "auto"}
	case map[string]interface{}:
		if fn, ok := v["function"].(map[string]interface{}); ok {
			return map[string]interface{}{"type": "tool", "name": fn["name"]}
		}
	}
	return map[string]interface{}{"type": "auto"}
}

func claudeToOpenAI(body []byte) ([]byte, error) {
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		return body, nil // pass through on parse error
	}

	id, _ := resp["id"].(string)
	model, _ := resp["model"].(string)

	// Extract content
	var content string
	var toolCalls []map[string]interface{}
	if contents, ok := resp["content"].([]interface{}); ok {
		for _, c := range contents {
			cm, ok := c.(map[string]interface{})
			if !ok {
				continue
			}
			switch cm["type"] {
			case "text":
				content += cm["text"].(string)
			case "tool_use":
				tcID, _ := cm["id"].(string)
				tcName, _ := cm["name"].(string)
				inputBytes, _ := json.Marshal(cm["input"])
				toolCalls = append(toolCalls, map[string]interface{}{
					"id":   tcID,
					"type": "function",
					"function": map[string]interface{}{
						"name":      tcName,
						"arguments": string(inputBytes),
					},
				})
			}
		}
	}

	// finish_reason
	stopReason, _ := resp["stop_reason"].(string)
	finishReason := "stop"
	switch stopReason {
	case "max_tokens":
		finishReason = "length"
	case "tool_use":
		finishReason = "tool_calls"
	case "end_turn":
		finishReason = "stop"
	}

	delta := map[string]interface{}{"role": "assistant", "content": content}
	if len(toolCalls) > 0 {
		delta["content"] = nil
		delta["tool_calls"] = toolCalls
	}
	choice := map[string]interface{}{
		"index":         0,
		"message":       delta,
		"finish_reason": finishReason,
	}

	// usage
	usage := map[string]interface{}{}
	if usg, ok := resp["usage"].(map[string]interface{}); ok {
		in, _ := usg["input_tokens"].(float64)
		out, _ := usg["output_tokens"].(float64)
		usage["prompt_tokens"] = int64(in)
		usage["completion_tokens"] = int64(out)
		usage["total_tokens"] = int64(in + out)
	}

	out := map[string]interface{}{
		"id":      id,
		"object":  "chat.completion",
		"model":   model,
		"choices": []interface{}{choice},
		"usage":   usage,
	}
	return json.Marshal(out)
}

// claudeRequestToOpenAI converts a Claude Messages API request body to OpenAI format.
func claudeRequestToOpenAI(req map[string]interface{}) (map[string]interface{}, error) {
	out := make(map[string]interface{})

	if m, ok := req["model"].(string); ok {
		out["model"] = m
	}
	if mt, ok := req["max_tokens"]; ok {
		out["max_tokens"] = mt
	}
	if t, ok := req["temperature"]; ok {
		out["temperature"] = t
	}
	if tp, ok := req["top_p"]; ok {
		out["top_p"] = tp
	}
	if s, ok := req["stream"]; ok {
		out["stream"] = s
	}
	if speed, ok := req["speed"]; ok {
		out["speed"] = speed
	}

	var messages []interface{}

	// Claude top-level system field → OpenAI system message
	if sys, ok := req["system"].(string); ok && sys != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": sys,
		})
	}

	if msgs, ok := req["messages"].([]interface{}); ok {
		for _, m := range msgs {
			msg, ok := m.(map[string]interface{})
			if !ok {
				continue
			}
			role, _ := msg["role"].(string)

			switch c := msg["content"].(type) {
			case string:
				messages = append(messages, map[string]interface{}{
					"role":    role,
					"content": c,
				})
			case []interface{}:
				// Claude content blocks → OpenAI content
				var textParts []string
				var richParts []map[string]interface{}
				hasRich := false
				toolResultHandled := false

				for _, block := range c {
					bm, ok := block.(map[string]interface{})
					if !ok {
						continue
					}
					switch bm["type"] {
					case "text":
						text, _ := bm["text"].(string)
						textParts = append(textParts, text)
						richParts = append(richParts, map[string]interface{}{"type": "text", "text": text})

					case "image":
						hasRich = true
						if source, ok := bm["source"].(map[string]interface{}); ok {
							switch source["type"] {
							case "base64":
								mime, _ := source["media_type"].(string)
								data, _ := source["data"].(string)
								richParts = append(richParts, map[string]interface{}{
									"type": "image_url",
									"image_url": map[string]interface{}{
										"url": "data:" + mime + ";base64," + data,
									},
								})
							case "url":
								url, _ := source["url"].(string)
								richParts = append(richParts, map[string]interface{}{
									"type":      "image_url",
									"image_url": map[string]interface{}{"url": url},
								})
							}
						}

					case "image_url":
						hasRich = true
						richParts = append(richParts, bm)

					case "tool_result":
						// Each tool_result block becomes a separate tool message in OpenAI
						toolResultHandled = true
						toolUseID, _ := bm["tool_use_id"].(string)
						var content string
						switch rc := bm["content"].(type) {
						case string:
							content = rc
						case []interface{}:
							for _, rb := range rc {
								if rbm, ok := rb.(map[string]interface{}); ok {
									if t, _ := rbm["text"].(string); t != "" {
										content += t
									}
								}
							}
						}
						messages = append(messages, map[string]interface{}{
							"role":         "tool",
							"tool_call_id": toolUseID,
							"content":      content,
						})

					case "tool_use":
						// tool_use blocks in assistant messages → tool_calls array
						hasRich = true
						tcID, _ := bm["id"].(string)
						tcName, _ := bm["name"].(string)
						argsBytes, _ := json.Marshal(bm["input"])
						richParts = append(richParts, map[string]interface{}{
							"_tool_use": map[string]interface{}{
								"id":        tcID,
								"name":      tcName,
								"arguments": string(argsBytes),
							},
						})
					}
				}

				if toolResultHandled {
					continue // already appended tool messages
				}

				// Extract tool_use entries from richParts
				var toolCalls []map[string]interface{}
				var cleanParts []map[string]interface{}
				for _, rp := range richParts {
					if tu, ok := rp["_tool_use"].(map[string]interface{}); ok {
						toolCalls = append(toolCalls, map[string]interface{}{
							"id":   tu["id"],
							"type": "function",
							"function": map[string]interface{}{
								"name":      tu["name"],
								"arguments": tu["arguments"],
							},
						})
					} else {
						cleanParts = append(cleanParts, rp)
					}
				}

				outMsg := map[string]interface{}{"role": role}
				if len(toolCalls) > 0 {
					outMsg["content"] = nil
					outMsg["tool_calls"] = toolCalls
				} else if hasRich {
					outMsg["content"] = cleanParts
				} else {
					outMsg["content"] = strings.Join(textParts, "")
				}
				messages = append(messages, outMsg)

			default:
				messages = append(messages, map[string]interface{}{
					"role":    role,
					"content": c,
				})
			}
		}
	}

	out["messages"] = messages

	// tools: Claude format → OpenAI format
	if tools, ok := req["tools"].([]interface{}); ok && len(tools) > 0 {
		out["tools"] = convertClaudeToolsToOpenAI(tools)
	}

	return out, nil
}

func convertClaudeToolsToOpenAI(tools []interface{}) []map[string]interface{} {
	var out []map[string]interface{}
	for _, t := range tools {
		tm, ok := t.(map[string]interface{})
		if !ok {
			continue
		}
		fn := map[string]interface{}{"name": tm["name"]}
		if desc, ok := tm["description"].(string); ok {
			fn["description"] = desc
		}
		if schema, ok := tm["input_schema"]; ok {
			fn["parameters"] = schema
		}
		out = append(out, map[string]interface{}{
			"type":     "function",
			"function": fn,
		})
	}
	return out
}

// openAIToClaudeResponse converts an OpenAI sync response to Claude Messages API format.
func openAIToClaudeResponse(body []byte) ([]byte, error) {
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		return body, nil
	}

	id, _ := resp["id"].(string)
	model, _ := resp["model"].(string)

	var content []map[string]interface{}
	stopReason := "end_turn"

	if choices, ok := resp["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if msg, ok := choice["message"].(map[string]interface{}); ok {
				switch c := msg["content"].(type) {
				case string:
					if c != "" {
						content = append(content, map[string]interface{}{"type": "text", "text": c})
					}
				case []interface{}:
					for _, block := range c {
						if bm, ok := block.(map[string]interface{}); ok {
							content = append(content, bm)
						}
					}
				}
				if toolCalls, ok := msg["tool_calls"].([]interface{}); ok {
					for _, tc := range toolCalls {
						if tcm, ok := tc.(map[string]interface{}); ok {
							tcID, _ := tcm["id"].(string)
							fn, _ := tcm["function"].(map[string]interface{})
							name, _ := fn["name"].(string)
							argsStr, _ := fn["arguments"].(string)
							var input interface{}
							_ = json.Unmarshal([]byte(argsStr), &input)
							content = append(content, map[string]interface{}{
								"type":  "tool_use",
								"id":    tcID,
								"name":  name,
								"input": input,
							})
							stopReason = "tool_use"
						}
					}
				}
			}
			if fr, ok := choice["finish_reason"].(string); ok {
				switch fr {
				case "length":
					stopReason = "max_tokens"
				case "tool_calls":
					stopReason = "tool_use"
				}
			}
		}
	}

	usage := map[string]interface{}{"input_tokens": int64(0), "output_tokens": int64(0)}
	if usg, ok := resp["usage"].(map[string]interface{}); ok {
		if pt, ok := usg["prompt_tokens"].(float64); ok {
			usage["input_tokens"] = int64(pt)
		}
		if ct, ok := usg["completion_tokens"].(float64); ok {
			usage["output_tokens"] = int64(ct)
		}
	}

	out := map[string]interface{}{
		"id":            id,
		"type":          "message",
		"role":          "assistant",
		"model":         model,
		"content":       content,
		"stop_reason":   stopReason,
		"stop_sequence": nil,
		"usage":         usage,
	}
	return json.Marshal(out)
}
