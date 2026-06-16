package handler

import (
	"net/http"
	"testing"

	"fanapi/internal/model"
)

func TestNormalizeRealtimeWSURLFromOpenAIBase(t *testing.T) {
	got := normalizeRealtimeWSURL("https://api.openai.com/v1", "gpt-realtime")
	want := "wss://api.openai.com/v1/realtime?model=gpt-realtime"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeRealtimeWSURLKeepsExplicitRealtimeModel(t *testing.T) {
	got := normalizeRealtimeWSURL("wss://api.openai.com/v1/realtime?model=explicit", "gpt-realtime")
	want := "wss://api.openai.com/v1/realtime?model=explicit"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeRealtimeWSURLFromChatCompletionsBase(t *testing.T) {
	got := normalizeRealtimeWSURL("https://api.openai.com/v1/chat/completions", "gpt-realtime")
	want := "wss://api.openai.com/v1/realtime?model=gpt-realtime"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestApplyRealtimeQueryAuth(t *testing.T) {
	ch := &model.Channel{AuthType: "query_param", AuthParamName: "api_key"}
	got, err := applyRealtimeQueryAuth("wss://example.com/v1/realtime?model=m", ch, "sk-test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "wss://example.com/v1/realtime?api_key=sk-test&model=m"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestBuildUpstreamWSHeadersAddsPoolBearerAndBeta(t *testing.T) {
	clientHeader := http.Header{}
	clientHeader.Set("X-API-Key", "local-user-key")
	clientHeader.Set("User-Agent", "test-client")
	ch := &model.Channel{AuthType: "bearer"}
	defaults := http.Header{}
	defaults.Set("OpenAI-Beta", realtimeOpenAIBetaHeader)

	headers, _, err := buildUpstreamWSHeaders(clientHeader, ch, "sk-upstream", true, nil, defaults)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := headers.Get("Authorization"); got != "Bearer sk-upstream" {
		t.Fatalf("expected upstream bearer auth, got %q", got)
	}
	if got := headers.Get("OpenAI-Beta"); got != realtimeOpenAIBetaHeader {
		t.Fatalf("expected OpenAI-Beta header, got %q", got)
	}
	if got := headers.Get("X-API-Key"); got != "" {
		t.Fatalf("expected local API key not to passthrough, got %q", got)
	}
	if got := headers.Get("User-Agent"); got != "test-client" {
		t.Fatalf("expected user agent passthrough, got %q", got)
	}
}

func TestRealtimeUsageFromResponseDone(t *testing.T) {
	event := map[string]interface{}{
		"type": "response.done",
		"response": map[string]interface{}{
			"usage": map[string]interface{}{
				"input_tokens":  float64(12),
				"output_tokens": float64(7),
				"input_token_details": map[string]interface{}{
					"cached_tokens": float64(3),
				},
			},
		},
	}

	usage := realtimeUsageFromEvent(event)
	if usage == nil {
		t.Fatal("expected usage")
	}
	if usage["prompt_tokens"] != int64(12) || usage["completion_tokens"] != int64(7) || usage["total_tokens"] != int64(19) {
		t.Fatalf("unexpected normalized usage: %#v", usage)
	}
	if usage["cache_read_tokens"] != int64(3) {
		t.Fatalf("expected cache_read_tokens, got %#v", usage["cache_read_tokens"])
	}
}
