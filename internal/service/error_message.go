package service

import "strings"

const genericUpstreamErrorMessage = "上游服务暂时不可用，请稍后重试"

// UserFacingErrorMessage removes internal upstream details such as URLs, IPs,
// network dial errors, and script implementation errors before returning errors to users.
func UserFacingErrorMessage(msg string) string {
	trimmed := strings.TrimSpace(msg)
	if trimmed == "" {
		return "请求失败，请稍后重试"
	}
	lower := strings.ToLower(trimmed)
	internalMarkers := []string{
		"upstream error:",
		"dial tcp",
		"i/o timeout",
		"client.timeout",
		"context deadline exceeded",
		"no such host",
		"connection refused",
		"connection reset",
		"tls handshake",
		"http://",
		"https://",
		"request mapping error:",
		"response mapping error:",
		"retry publish failed",
	}
	for _, marker := range internalMarkers {
		if strings.Contains(lower, marker) {
			return genericUpstreamErrorMessage
		}
	}
	return trimmed
}
