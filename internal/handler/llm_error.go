package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"fanapi/internal/script"
)

const (
	maxLLMLogErrorSummaryBytes   = 4 * 1024
	maxLLMUpstreamErrorBodyBytes = 64 * 1024
)

// readLLMUpstreamErrorBody bounds an upstream error body before it can enter
// error handling or logging. LLM error details are diagnostic metadata, not a
// response-payload storage path.
func readLLMUpstreamErrorBody(r io.Reader) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r, maxLLMUpstreamErrorBodyBytes))
}

// summarizeLLMUpstreamError preserves a small structured business message
// where possible. It never uses unstructured response content as a log value.
func summarizeLLMUpstreamError(status int, body []byte) string {
	var payload map[string]interface{}
	if json.Unmarshal(body, &payload) == nil {
		if message, ok := script.DetectUpstreamError(payload); ok && strings.TrimSpace(message) != "" {
			return limitLLMLogErrorSummary(fmt.Sprintf("上游返回 %d: %s", status, message))
		}
	}
	return fmt.Sprintf("上游返回 %d", status)
}

// limitLLMLogErrorSummary provides a final writer-side defense for every LLM
// error path, including future callers that do not originate from HTTP bodies.
func limitLLMLogErrorSummary(message string) string {
	message = strings.TrimSpace(strings.ToValidUTF8(strings.ReplaceAll(message, "\x00", ""), ""))
	if len(message) <= maxLLMLogErrorSummaryBytes {
		return message
	}

	truncated := message[:maxLLMLogErrorSummaryBytes]
	for len(truncated) > 0 && !utf8.ValidString(truncated) {
		truncated = truncated[:len(truncated)-1]
	}
	return truncated
}
