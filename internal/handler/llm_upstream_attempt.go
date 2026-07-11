package handler

import (
	"encoding/json"
	"fmt"

	"fanapi/internal/model"
	"fanapi/internal/protocol"
	"fanapi/internal/script"
	"fanapi/internal/upstream"

	"github.com/gin-gonic/gin"
)

type llmUpstreamAttempt struct {
	Target   llmUpstreamTarget
	Protocol string
	Request  map[string]interface{}
}

type llmUpstreamPreparationError struct {
	statusCode int
	err        error
}

func (e *llmUpstreamPreparationError) Error() string {
	if e == nil || e.err == nil {
		return "上游请求准备失败"
	}
	return e.err.Error()
}

func newLLMUpstreamPreparationError(statusCode int, err error) error {
	return &llmUpstreamPreparationError{statusCode: statusCode, err: err}
}

func llmUpstreamPreparationStatus(err error) int {
	if prepErr, ok := err.(*llmUpstreamPreparationError); ok && prepErr.statusCode > 0 {
		return prepErr.statusCode
	}
	return 500
}

// prepareLLMUpstreamAttempt builds an upstream request from the original
// client-format map for one specific pool key. It must run for the initial key
// and every rotation so protocol-derived conversion and request_script output
// cannot leak from a previous key.
func prepareLLMUpstreamAttempt(c *gin.Context, ch *model.Channel, poolKey *model.PoolKey,
	source map[string]interface{}, clientProto, resolvedModel string, isStream bool, responsesOperation string) (llmUpstreamAttempt, error) {
	request, err := cloneLLMRequestData(source)
	if err != nil {
		return llmUpstreamAttempt{}, newLLMUpstreamPreparationError(500, fmt.Errorf("复制请求数据失败: %w", err))
	}

	poolKeyValue := ""
	poolKeyBaseURL := ""
	if poolKey != nil {
		poolKeyValue = poolKey.Value
		poolKeyBaseURL = poolKey.BaseURLOverride
	}

	target := resolveLLMUpstreamTarget(
		upstream.BaseURLForPoolKey(ch.BaseURL, poolKeyBaseURL),
		matchedLLMRoute(c),
		effectiveProtocol(ch),
		resolvedModel,
		isStream,
		responsesOperation,
	)
	proto := target.Protocol
	isResponsesCompact := responsesOperation == responsesOperationCompact
	if isResponsesCompact && proto != protocolResponses {
		return llmUpstreamAttempt{}, newLLMUpstreamPreparationError(400, fmt.Errorf("对话压缩需要 protocol=responses 的上游渠道"))
	}

	needsConversion := !isResponsesCompact && shouldConvertRequestBody(clientProto, proto, request)
	if !ch.PassthroughBody && needsConversion && ch.RequestScript == "" {
		working := request
		if clientProto != protocolOpenAI {
			norm, normErr := protocol.NormalizeClientRequest(working, clientProto)
			if normErr != nil {
				return llmUpstreamAttempt{}, newLLMUpstreamPreparationError(400, fmt.Errorf("请求格式转换错误: %w", normErr))
			}
			norm["model"] = resolvedModel
			working = norm
		}
		if proto != protocolOpenAI {
			conv, convErr := protocol.ConvertRequest(working, proto)
			if convErr != nil {
				return llmUpstreamAttempt{}, newLLMUpstreamPreparationError(500, fmt.Errorf("请求格式转换错误: %w", convErr))
			}
			working = conv
		}
		request = working
	}

	if !ch.PassthroughBody && ch.RequestScript != "" {
		mapped, scriptErr := script.RunMapRequest(ch.RequestScript, request, poolKeyValue)
		if scriptErr != nil {
			return llmUpstreamAttempt{}, newLLMUpstreamPreparationError(500, fmt.Errorf("入参映射错误: %w", scriptErr))
		}
		request = mapped
	}

	if !ch.PassthroughBody && proto == protocolClaude {
		if _, ok := request["max_tokens"]; !ok {
			request["max_tokens"] = 4096
		}
	}

	if isStream && proto == protocolOpenAI {
		request["stream"] = true
		if opts, hasOpts := request["stream_options"].(map[string]interface{}); hasOpts {
			copiedOpts := make(map[string]interface{}, len(opts)+1)
			for key, value := range opts {
				copiedOpts[key] = value
			}
			copiedOpts["include_usage"] = true
			request["stream_options"] = copiedOpts
		} else {
			request["stream_options"] = map[string]interface{}{"include_usage": true}
		}
	}

	return llmUpstreamAttempt{Target: target, Protocol: proto, Request: request}, nil
}

func cloneLLMRequestData(source map[string]interface{}) (map[string]interface{}, error) {
	encoded, err := json.Marshal(source)
	if err != nil {
		return nil, err
	}
	var copied map[string]interface{}
	if err := json.Unmarshal(encoded, &copied); err != nil {
		return nil, err
	}
	if copied == nil {
		copied = map[string]interface{}{}
	}
	return copied, nil
}
