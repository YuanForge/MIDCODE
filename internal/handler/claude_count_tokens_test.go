package handler

import (
	"encoding/json"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClaudeCountURL(t *testing.T) {
	for _, path := range []string{"/v1", "/v1/", "/v1/messages", "/v1/messages/count_tokens"} {
		got, err := claudeCountURL("https://example.com" + path + "?region=x")
		if err != nil || got != "https://example.com/v1/messages/count_tokens?region=x" {
			t.Fatalf("%s: %s %v", path, got, err)
		}
	}
	if _, err := claudeCountURL("https://example.com/v1/chat/completions"); err == nil {
		t.Fatal("must not guess a generation URL")
	}
}

func TestClaudeCountForwardsNativePayloadAndPoolOverride(t *testing.T) {
	gin.SetMode(gin.TestMode)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/messages/count_tokens" || r.Method != "POST" {
			t.Errorf("wrong target %s", r.URL)
		}
		if r.Header.Get("Authorization") != "Bearer upstream-secret" || r.Header.Get("Anthropic-Version") != "2023-06-01" {
			t.Error("missing upstream headers")
		}
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		if body["model"] != "actual-model" || body["system"] == nil || body["tools"] == nil {
			t.Error("native fields lost")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"input_tokens":42}`))
	}))
	defer server.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/messages/count_tokens", nil)
	ch := &model.Channel{BaseURL: "https://unused.invalid/v1/messages", Model: "actual-model", PassthroughBody: true}
	pk := &model.PoolKey{Value: "upstream-secret", BaseURLOverride: server.URL + "/v1"}
	got, err := requestClaudeTokenCount(c, ch, pk, map[string]interface{}{"model": "alias", "system": []interface{}{map[string]interface{}{"type": "text", "text": "system"}}, "tools": []interface{}{map[string]interface{}{"name": "tool"}}, "messages": []interface{}{}})
	if err != nil || got != 42 || calls != 1 {
		t.Fatalf("got %d %v calls %d", got, err, calls)
	}
	if pk.BaseURLOverride != server.URL+"/v1" || ch.BaseURL != "https://unused.invalid/v1/messages" {
		t.Fatal("modified shared config")
	}
}

func TestClaudeCountRejectsBadProviderResponse(t *testing.T) {
	for _, body := range []string{`{}`, `{"input_tokens":-1}`, `{"input_tokens":1.5}`, `{"input_tokens":"4"}`, `<html>bad</html>`} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(body)) }))
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/messages/count_tokens", nil)
		_, err := requestClaudeTokenCount(c, &model.Channel{BaseURL: server.URL + "/v1/messages"}, nil, map[string]interface{}{})
		server.Close()
		if err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
}
