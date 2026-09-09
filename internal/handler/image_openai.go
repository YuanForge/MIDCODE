package handler

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"fanapi/internal/protocol"
	"github.com/gin-gonic/gin"
)

func isOpenAIImageRoute(route string) bool {
	return route == "/v1/images/generations" || route == "/v1/images/edits"
}

// CreateOpenAIImageGenerations forwards images through the synchronous LLM pipeline.
// @Summary OpenAI 图片生成
// @Description 使用 LLM 渠道同步转发上游图片生成接口，直接返回上游 JSON，不创建异步任务。
// @Tags 媒体生成
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body model.ImageRequest true "OpenAI 图片生成参数"
// @Success 200 {object} object
// @Router /v1/images/generations [post]
func CreateOpenAIImageGenerations(c *gin.Context) {
	c.Set("client_proto", protocolOpenAI)
	c.Set(llmRouteContextKey, "/v1/images/generations")
	llmProxy(c)
}

func validateOpenAIImageRequest(req map[string]interface{}) error {
	for _, key := range []string{"model", "prompt"} {
		value, _ := req[key].(string)
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s is required", key)
		}
	}
	if n, exists := req["n"]; exists {
		count, ok := n.(float64)
		if !ok || math.IsNaN(count) || math.IsInf(count, 0) || count <= 0 || math.Trunc(count) != count {
			return fmt.Errorf("n must be a positive integer")
		}
	}
	if stream, exists := req["stream"]; exists && stream != false {
		return fmt.Errorf("image endpoints only support synchronous requests (stream=false)")
	}
	return nil
}

// Keep the original response untouched; normalize only the billing metadata.
func openAIImageUsage(resp map[string]interface{}) map[string]interface{} {
	proto := protocolOpenAI
	if usage, ok := resp["usage"].(map[string]interface{}); ok {
		if _, exists := usage["input_tokens"]; exists {
			proto = protocolResponses
		}
	}
	usage := protocol.NormalizeUsage(resp, proto)
	if data, ok := resp["data"].([]interface{}); ok {
		if usage == nil {
			usage = make(map[string]interface{})
		}
		usage["image_count"] = int64(len(data))
	}
	return usage
}

func decodeLLMRequest(c *gin.Context, body []byte) (map[string]interface{}, error) {
	var req map[string]interface{}
	var err error
	if matchedLLMRoute(c) == "/v1/images/edits" && strings.HasPrefix(c.GetHeader("Content-Type"), "multipart/form-data") {
		req, err = decodeOpenAIImageMultipart(c, body)
	} else {
		err = json.Unmarshal(body, &req)
	}
	if err == nil && isOpenAIImageRoute(matchedLLMRoute(c)) {
		err = validateOpenAIImageRequest(req)
	}
	return req, err
}
