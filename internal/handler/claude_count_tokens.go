package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"fanapi/internal/model"
	"fanapi/internal/service"
	"fanapi/internal/upstream"
	"github.com/gin-gonic/gin"
)

// ClaudeCountTokens forwards the provider's count, without generation or billing.
// Counts are provider estimates; some providers do not count image inputs.
func ClaudeCountTokens(c *gin.Context) {
	fail := func(status int, kind, message string) {
		c.JSON(status, gin.H{"type": "error", "error": gin.H{"type": kind, "message": message}})
	}
	var data map[string]interface{}
	dec := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 32<<20))
	if err := dec.Decode(&data); err != nil {
		fail(400, "invalid_request_error", "Invalid JSON request")
		return
	}
	var extra interface{}
	if err := dec.Decode(&extra); err != io.EOF {
		fail(400, "invalid_request_error", "Expected one JSON object")
		return
	}
	name, _ := data["model"].(string)
	messages, ok := data["messages"].([]interface{})
	if strings.TrimSpace(name) == "" || !ok || len(messages) == 0 {
		fail(400, "invalid_request_error", "model and nonempty messages are required")
		return
	}
	keyID, _ := c.Get("api_key_id")
	id, _ := keyID.(int64)
	if id <= 0 {
		fail(401, "authentication_error", "API key required")
		return
	}
	if c.Query("channel_id") != "" {
		fail(400, "invalid_request_error", "Use model routing for count_tokens")
		return
	}
	channels, err := selectAPIKeyModelChannels(c.Request.Context(), id, name, protocolClaude)
	if err != nil || len(channels) == 0 {
		if errors.Is(err, service.ErrAPIKeyModelGroupsNotConfigured) {
			fail(403, "permission_error", "Bind a model group to this API key")
		} else {
			fail(404, "not_found_error", "No accessible Claude channel for this model")
		}
		return
	}
	ch := channels[0]
	var pk *model.PoolKey
	if ch.KeyPoolID > 0 {
		pk, err = service.GetOrAssignPoolKey(c.Request.Context(), ch.KeyPoolID, id)
		if err != nil {
			fail(503, "api_error", "No available provider credential")
			return
		}
	}
	count, err := requestClaudeTokenCount(c, &ch, pk, data)
	if err != nil {
		fail(502, "api_error", err.Error())
		return
	}
	c.Header("X-Token-Count-Source", "upstream")
	c.JSON(200, gin.H{"input_tokens": count})
}

func claudeCountURL(base string) (string, error) {
	u, err := url.Parse(base)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.Fragment != "" {
		return "", fmt.Errorf("Unsupported provider URL")
	}
	path := strings.TrimRight(u.Path, "/")
	switch {
	case strings.HasSuffix(path, "/messages/count_tokens"):
	case strings.HasSuffix(path, "/messages"):
		path += "/count_tokens"
	case strings.HasSuffix(path, "/v1"):
		path += "/messages/count_tokens"
	case path == "":
		path = "/v1/messages/count_tokens"
	default:
		return "", fmt.Errorf("Provider has no supported count_tokens endpoint")
	}
	u.Path = path
	u.RawPath = ""
	return u.String(), nil
}

func requestClaudeTokenCount(c *gin.Context, ch *model.Channel, pk *model.PoolKey, data map[string]interface{}) (int64, error) {
	override := ""
	if pk != nil {
		override = pk.BaseURLOverride
	}
	target, err := claudeCountURL(upstream.BaseURLForPoolKey(ch.BaseURL, override))
	if err != nil {
		return 0, err
	}
	copyCh := *ch
	copyCh.BaseURL = target
	copyCh.Method = http.MethodPost
	copyCh.PassthroughBody = false
	copyCh.TimeoutMs = 30000
	copyCh.Headers = model.JSON{}
	for k, v := range ch.Headers {
		copyCh.Headers[k] = v
	}
	copyCh.Headers["Accept"] = "application/json"
	version := c.GetHeader("Anthropic-Version")
	if version == "" {
		version = "2023-06-01"
	}
	copyCh.Headers["Anthropic-Version"] = version
	if beta := c.GetHeader("Anthropic-Beta"); beta != "" {
		copyCh.Headers["Anthropic-Beta"] = beta
	}
	var copyKey *model.PoolKey
	if pk != nil {
		v := *pk
		v.BaseURLOverride = ""
		copyKey = &v
	}
	payload := make(map[string]interface{}, len(data))
	for k, v := range data {
		payload[k] = v
	}
	if ch.Model != "" {
		payload["model"] = ch.Model
	}
	_, resp, err := sendLLMRequest(c, &copyCh, payload, copyKey, protocolClaude, ch.Model, false)
	if err != nil {
		return 0, fmt.Errorf("Provider token count request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("Provider count_tokens returned HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, fmt.Errorf("Cannot read provider token count")
	}
	var result struct {
		InputTokens *int64 `json:"input_tokens"`
	}
	if json.Unmarshal(raw, &result) != nil || result.InputTokens == nil || *result.InputTokens < 0 {
		return 0, fmt.Errorf("Provider returned an invalid token count")
	}
	return *result.InputTokens, nil
}
