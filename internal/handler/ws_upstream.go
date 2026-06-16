package handler

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

	"fanapi/internal/model"
	"fanapi/internal/script"
)

var upstreamWSPassthroughSkip = map[string]bool{
	"Authorization":            true,
	"Host":                     true,
	"Content-Length":           true,
	"Transfer-Encoding":        true,
	"Connection":               true,
	"Upgrade":                  true,
	"Proxy-Connection":         true,
	"X-API-Key":                true,
	"X-API-Key-Id":             true,
	"X-Goog-Api-Key":           true,
	"Cookie":                   true,
	"Sec-Websocket-Key":        true,
	"Sec-Websocket-Version":    true,
	"Sec-Websocket-Extensions": true,
	"Sec-Websocket-Protocol":   true,
}

func buildUpstreamWSHeaders(clientHeader http.Header, ch *model.Channel, poolKeyVal string, passthrough bool, skipChannelHeaders map[string]bool, defaultHeaders http.Header) (http.Header, map[string]string, error) {
	headers := http.Header{}
	if passthrough {
		for k, vals := range clientHeader {
			if !shouldSkipChannelHeader(k, upstreamWSPassthroughSkip) {
				headers[k] = append([]string(nil), vals...)
			}
		}
	}

	for k, vals := range defaultHeaders {
		if headers.Get(k) == "" {
			headers[k] = append([]string(nil), vals...)
		}
	}

	for k, v := range ch.Headers {
		if shouldSkipChannelHeader(k, skipChannelHeaders) {
			continue
		}
		if sv, ok := v.(string); ok {
			headers.Set(k, script.ResolveHeaderValue(sv, poolKeyVal))
		}
	}

	if err := applyChannelAuthToHeader(headers, ch, poolKeyVal); err != nil {
		return nil, nil, err
	}

	return headers, flattenHeader(headers), nil
}

func shouldSkipChannelHeader(key string, skip map[string]bool) bool {
	for k := range skip {
		if strings.EqualFold(key, k) {
			return true
		}
	}
	return false
}

func applyChannelAuthToHeader(headers http.Header, ch *model.Channel, key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}

	authType := strings.ToLower(strings.TrimSpace(ch.AuthType))
	if authType == "" {
		authType = "bearer"
	}

	switch authType {
	case "bearer":
		if headers.Get("Authorization") == "" {
			headers.Set("Authorization", "Bearer "+key)
		}
	case "basic":
		if headers.Get("Authorization") != "" {
			return nil
		}
		parts := strings.SplitN(key, ":", 2)
		if len(parts) != 2 {
			return fmt.Errorf("basic key format should be user:pass")
		}
		headers.Set("Authorization", "Basic "+basicAuth(parts[0], parts[1]))
	case "query_param", "sigv4":
		return nil
	default:
		return fmt.Errorf("unsupported auth_type: %s", authType)
	}
	return nil
}

func flattenHeader(headers http.Header) map[string]string {
	out := make(map[string]string, len(headers))
	for k, vals := range headers {
		out[k] = strings.Join(vals, ", ")
	}
	return out
}

func basicAuth(username, password string) string {
	auth := username + ":" + password
	return base64.StdEncoding.EncodeToString([]byte(auth))
}
