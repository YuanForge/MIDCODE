package handler

import (
	"encoding/json"
	"strings"

	"fanapi/internal/billing"
	"fanapi/internal/model"
)

// usageState 在 SSE 流中收集 token 用量，支持 OpenAI / Claude / Gemini 三种协议。
// promptTokens / completTokens 从响应尾部的 usage 字段读取（最精确）。
// outputChars 在流式传输过程中实时累计输出文本字节数，作为用户中断时的兜底估算依据
// （约 4 字节 ≈ 1 token）。
// imageCount 统计 delta content 中出现的 markdown 图片数量（![ 语法），用于多模态图片计费。
type usageState struct {
	protocol            string
	promptTokens        int64
	completTokens       int64
	thinkingTokens      int64  // Gemini 思考模型：thoughtsTokenCount（按输出 token 计费）
	cacheCreationTokens int64  // Claude 写入缓存 token（1.25x）
	cacheReadTokens     int64  // Claude/OpenAI/Gemini 命中缓存 token（折才价）
	outputChars         int64  // 实时累计输出字符数（兜底估算）
	imageCount          int64  // 多模态图片生成：响应中检测到的图片数量
	lastEvent           string // Claude 专用：记录上一个 "event:" 行的值
	actualServiceTier   string // OpenAI/Responses 实际服务档位
	actualSpeed         string // Claude 实际速度档位
}

func (u *usageState) processLine(line string) {
	switch u.protocol {
	case protocolClaude:
		if strings.HasPrefix(line, "event: ") {
			u.lastEvent = strings.TrimPrefix(line, "event: ")
			return
		}
		if strings.HasPrefix(line, "data: ") {
			payload := strings.TrimPrefix(line, "data: ")
			var chunk map[string]interface{}
			if json.Unmarshal([]byte(payload), &chunk) != nil {
				return
			}
			switch u.lastEvent {
			case "message_start":
				if msg, ok := chunk["message"].(map[string]interface{}); ok {
					if usg, ok := msg["usage"].(map[string]interface{}); ok {
						if speed, _ := usg["speed"].(string); speed != "" {
							u.actualSpeed = speed
						}
						if n, _ := usg["input_tokens"].(float64); n > 0 {
							u.promptTokens = int64(n)
						}
						if n, _ := usg["cache_creation_input_tokens"].(float64); n > 0 {
							u.cacheCreationTokens = int64(n)
						}
						if n, _ := usg["cache_read_input_tokens"].(float64); n > 0 {
							u.cacheReadTokens = int64(n)
						}
					}
				}
			case "message_delta":
				if usg, ok := chunk["usage"].(map[string]interface{}); ok {
					if speed, _ := usg["speed"].(string); speed != "" {
						u.actualSpeed = speed
					}
					if n, _ := usg["output_tokens"].(float64); n > 0 {
						u.completTokens = int64(n)
					}
				}
			case "content_block_delta":
				// 实时累计输出字符（兜底）
				if delta, ok := chunk["delta"].(map[string]interface{}); ok {
					if text, _ := delta["text"].(string); text != "" {
						u.outputChars += int64(len(text))
					}
				}
			}
		}

	case protocolGemini:
		if strings.HasPrefix(line, "data: ") {
			payload := strings.TrimPrefix(line, "data: ")
			var chunk map[string]interface{}
			if json.Unmarshal([]byte(payload), &chunk) != nil {
				return
			}
			if meta, ok := chunk["usageMetadata"].(map[string]interface{}); ok {
				if n, _ := meta["promptTokenCount"].(float64); n > 0 {
					u.promptTokens = int64(n)
				}
				if n, _ := meta["candidatesTokenCount"].(float64); n > 0 {
					u.completTokens = int64(n)
				}
				// Gemini 思考模型：思考 token 按输出 token 计费
				if n, _ := meta["thoughtsTokenCount"].(float64); n > 0 {
					u.thinkingTokens = int64(n)
				}
				// Gemini Context Caching: cachedContentTokenCount
				if n, _ := meta["cachedContentTokenCount"].(float64); n > 0 {
					u.cacheReadTokens = int64(n)
				}
			}
			// 实时累计输出字符（兜底），跳过思考链 part
			if candidates, ok := chunk["candidates"].([]interface{}); ok && len(candidates) > 0 {
				if cand, ok := candidates[0].(map[string]interface{}); ok {
					if content, ok := cand["content"].(map[string]interface{}); ok {
						if parts, ok := content["parts"].([]interface{}); ok {
							for _, p := range parts {
								if pm, ok := p.(map[string]interface{}); ok {
									// 跳过思考链 part，避免虚增输出字符估算
									if thought, _ := pm["thought"].(bool); thought {
										continue
									}
									if _, hasThoughtSig := pm["thoughtSignature"]; hasThoughtSig {
										continue
									}
									if text, _ := pm["text"].(string); text != "" {
										u.outputChars += int64(len(text))
									}
								}
							}
						}
					}
				}
			}
		}

	default: // OpenAI 协议
		if strings.HasPrefix(line, "data: ") {
			payload := strings.TrimPrefix(line, "data: ")
			if payload == "[DONE]" {
				return
			}
			var chunk map[string]interface{}
			if json.Unmarshal([]byte(payload), &chunk) != nil {
				return
			}
			if usg, ok := chunk["usage"].(map[string]interface{}); ok {
				if serviceTier, _ := chunk["service_tier"].(string); serviceTier != "" {
					u.actualServiceTier = serviceTier
				}
				if n, _ := usg["prompt_tokens"].(float64); n > 0 {
					u.promptTokens = int64(n)
				}
				if n, _ := usg["completion_tokens"].(float64); n > 0 {
					u.completTokens = int64(n)
				}
				// OpenAI prompt caching: prompt_tokens_details.cached_tokens
				if details, ok := usg["prompt_tokens_details"].(map[string]interface{}); ok {
					if n, _ := details["cached_tokens"].(float64); n > 0 {
						u.cacheReadTokens = int64(n)
					}
				}
			}
			// Responses API (response.completed): usage 嵌套在 chunk["response"]["usage"]
			// 字段名为 input_tokens / output_tokens，缓存命中在 input_tokens_details.cached_tokens
			if resp, ok := chunk["response"].(map[string]interface{}); ok {
				if serviceTier, _ := resp["service_tier"].(string); serviceTier != "" {
					u.actualServiceTier = serviceTier
				}
				if usg, ok := resp["usage"].(map[string]interface{}); ok {
					if n, _ := usg["input_tokens"].(float64); n > 0 {
						u.promptTokens = int64(n)
					}
					if n, _ := usg["output_tokens"].(float64); n > 0 {
						u.completTokens = int64(n)
					}
					if details, ok := usg["input_tokens_details"].(map[string]interface{}); ok {
						if n, _ := details["cached_tokens"].(float64); n > 0 {
							u.cacheReadTokens = int64(n)
						}
					}
				}
			}
			// 实时累计输出字符（用户中断时兜底）；同时统计 markdown 图片数量（多模态模型）
			if choices, ok := chunk["choices"].([]interface{}); ok && len(choices) > 0 {
				if choice, ok := choices[0].(map[string]interface{}); ok {
					if delta, ok := choice["delta"].(map[string]interface{}); ok {
						if content, _ := delta["content"].(string); content != "" {
							u.outputChars += int64(len(content))
							// 统计 markdown 图片（![...](url) 格式）及 base64 内联图片
							// 每个 ![ 或 data:image/ 出现一次视为一张图片
							u.imageCount += int64(strings.Count(content, "!["))
							u.imageCount += int64(strings.Count(content, "data:image/"))
						}
					}
				}
			}
			// Responses API (response.output_text.delta): delta 直接是字符串
			if chunkType, _ := chunk["type"].(string); strings.HasPrefix(chunkType, "response.output_text") {
				if text, _ := chunk["delta"].(string); text != "" {
					u.outputChars += int64(len(text))
				}
			}
		}
	}
}

// normalized 返回标准化的 usage map（prompt_tokens / completion_tokens）供计费使用。
// 优先使用响应尾部精确的 usage 字段；若流被中断（无 usage），则根据实时累计的
// outputChars 估算 completion_tokens，并从请求消息内容估算 prompt_tokens，
// 确保用户中断时仍按实际消耗计费，不会全额退款。
func (u *usageState) normalized(req map[string]interface{}) map[string]interface{} {
	if u.promptTokens > 0 || u.completTokens > 0 || u.thinkingTokens > 0 {
		// 精确值：来自响应尾部 usage 字段
		// Gemini 思考模型：思考 token 按输出 token 计费，合并到 completion_tokens
		result := map[string]interface{}{
			"prompt_tokens":     u.promptTokens,
			"completion_tokens": u.completTokens + u.thinkingTokens,
		}
		if u.cacheCreationTokens > 0 {
			result["cache_creation_tokens"] = u.cacheCreationTokens
		}
		if u.cacheReadTokens > 0 {
			result["cache_read_tokens"] = u.cacheReadTokens
		}
		if u.imageCount > 0 {
			result["image_count"] = u.imageCount
		}
		if u.actualServiceTier != "" {
			result["actual_service_tier"] = u.actualServiceTier
		}
		if u.actualSpeed != "" {
			result["actual_speed"] = u.actualSpeed
		}
		return result
	}
	if u.outputChars == 0 && u.imageCount == 0 {
		// 完全没有数据（连接失败等），不作结算
		return nil
	}
	if u.imageCount > 0 && u.outputChars == 0 {
		// 仅有图片输出（纯图片生成模型，无 token usage），按图片计费路径结算
		return map[string]interface{}{
			"image_count": u.imageCount,
		}
	}
	// 兜底估算：用于用户中断或上游未返回 usage 的场景
	// 4 字节 ≈ 1 token，乘以 1.1 留出余量
	estimatedOutput := int64(float64(u.outputChars)/4.0*1.1) + 1
	estimatedInput := billing.EstimateTokensFromRequest(req)
	result := map[string]interface{}{
		"prompt_tokens":     estimatedInput,
		"completion_tokens": estimatedOutput,
		"estimated":         true, // 标记为估算值，便于排查
	}
	if u.imageCount > 0 {
		result["image_count"] = u.imageCount
	}
	if u.actualServiceTier != "" {
		result["actual_service_tier"] = u.actualServiceTier
	}
	if u.actualSpeed != "" {
		result["actual_speed"] = u.actualSpeed
	}
	return result
}

// buildStreamClientResponse 从上游 SSE 原始行中提取并组装文本内容，
// 存入 client_response 供用户端日志展示平台返回了什么。
func buildStreamClientResponse(lines []string, proto string) model.JSON {
	var buf strings.Builder
	var lastEvent string
	for _, line := range lines {
		switch proto {
		case protocolClaude:
			if strings.HasPrefix(line, "event: ") {
				lastEvent = strings.TrimPrefix(line, "event: ")
				continue
			}
			if lastEvent == "content_block_delta" && strings.HasPrefix(line, "data: ") {
				var chunk map[string]interface{}
				if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &chunk) == nil {
					if delta, ok := chunk["delta"].(map[string]interface{}); ok {
						if text, _ := delta["text"].(string); text != "" {
							buf.WriteString(text)
						}
					}
				}
			}
		case protocolGemini:
			if strings.HasPrefix(line, "data: ") {
				var chunk map[string]interface{}
				if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &chunk) == nil {
					if candidates, ok := chunk["candidates"].([]interface{}); ok && len(candidates) > 0 {
						if cand, ok := candidates[0].(map[string]interface{}); ok {
							if content, ok := cand["content"].(map[string]interface{}); ok {
								if parts, ok := content["parts"].([]interface{}); ok {
									for _, p := range parts {
										if pm, ok := p.(map[string]interface{}); ok {
											// 跳过 Gemini 思考链 part（thought=true 或含 thoughtSignature），
											// 与实际返回给客户端的 SSE 转换逻辑保持一致。
											if thought, _ := pm["thought"].(bool); thought {
												continue
											}
											if _, hasSig := pm["thoughtSignature"]; hasSig {
												continue
											}
											if t, _ := pm["text"].(string); t != "" {
												buf.WriteString(t)
											}
										}
									}
								}
							}
						}
					}
				}
			}
		default: // openai
			if strings.HasPrefix(line, "data: ") {
				payload := strings.TrimPrefix(line, "data: ")
				if payload == "[DONE]" {
					continue
				}
				var chunk map[string]interface{}
				if json.Unmarshal([]byte(payload), &chunk) == nil {
					if choices, ok := chunk["choices"].([]interface{}); ok && len(choices) > 0 {
						if choice, ok := choices[0].(map[string]interface{}); ok {
							if delta, ok := choice["delta"].(map[string]interface{}); ok {
								if text, _ := delta["content"].(string); text != "" {
									buf.WriteString(text)
								}
							}
						}
					}
				}
			}
		}
	}
	text := buf.String()
	if text == "" {
		return nil
	}
	return model.JSON{"content": text, "stream": true}
}

type responsesPassthroughSSEFilter struct {
	block []string
}

func (f *responsesPassthroughSSEFilter) Convert(line string) []string {
	f.block = append(f.block, line)
	if line != "" {
		return nil
	}
	return f.flushBlock()
}

func (f *responsesPassthroughSSEFilter) Flush() []string {
	return f.flushBlock()
}

func (f *responsesPassthroughSSEFilter) flushBlock() []string {
	if len(f.block) == 0 {
		return nil
	}
	block := f.block
	f.block = nil
	if isEmptyChatCompletionSSEBlock(block) {
		return nil
	}
	return block
}

func isEmptyChatCompletionSSEBlock(block []string) bool {
	for _, line := range block {
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var chunk map[string]interface{}
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			return false
		}
		if object, _ := chunk["object"].(string); object != "chat.completion.chunk" {
			return false
		}
		return chatCompletionChunkHasNoOutput(chunk)
	}
	return false
}

func chatCompletionChunkHasNoOutput(chunk map[string]interface{}) bool {
	choices, _ := chunk["choices"].([]interface{})
	if len(choices) == 0 {
		return true
	}
	for _, rawChoice := range choices {
		choice, _ := rawChoice.(map[string]interface{})
		if choice == nil {
			return false
		}
		if finish, _ := choice["finish_reason"].(string); finish != "" {
			return false
		}
		delta, _ := choice["delta"].(map[string]interface{})
		if delta == nil {
			continue
		}
		if content, _ := delta["content"].(string); content != "" {
			return false
		}
		if _, ok := delta["tool_calls"]; ok {
			return false
		}
		if _, ok := delta["function_call"]; ok {
			return false
		}
	}
	if _, ok := chunk["usage"]; ok {
		return false
	}
	return true
}
