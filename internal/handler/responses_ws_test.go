package handler

import (
	"testing"

	"fanapi/internal/model"
)

func TestNormalizeResponsesWSURLFromOpenAIBase(t *testing.T) {
	got := normalizeResponsesWSURL("https://api.openai.com/v1")
	want := "wss://api.openai.com/v1/responses"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeResponsesWSURLFromChatCompletionsBase(t *testing.T) {
	got := normalizeResponsesWSURL("https://api.example.com/v1/chat/completions?api-version=2026-06-01")
	want := "wss://api.example.com/v1/responses?api-version=2026-06-01"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeResponsesWSURLKeepsExplicitCustomEndpoint(t *testing.T) {
	got := normalizeResponsesWSURL("wss://api.example.com/custom/responses-ws")
	want := "wss://api.example.com/custom/responses-ws"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestPrepareResponsesWSRequestStripsTransportFields(t *testing.T) {
	req := map[string]interface{}{
		"model":                "routing-model",
		"input":                "hello",
		"stream":               true,
		"background":           true,
		"stream_options":       map[string]interface{}{"include_usage": true},
		"previous_response_id": "resp_prev",
		"generate":             false,
		"store":                false,
	}

	got := prepareResponsesWSRequest(req, "gpt-upstream")

	if got["model"] != "gpt-upstream" {
		t.Fatalf("expected resolved model override, got %#v", got["model"])
	}
	for _, key := range []string{"stream", "background", "stream_options"} {
		if _, ok := got[key]; ok {
			t.Fatalf("expected %s to be stripped, got %#v", key, got[key])
		}
	}
	if got["previous_response_id"] != "resp_prev" {
		t.Fatalf("expected previous_response_id to be preserved, got %#v", got["previous_response_id"])
	}
	if v, ok := got["generate"].(bool); !ok || v {
		t.Fatalf("expected generate=false to be preserved, got %#v", got["generate"])
	}
	if v, ok := got["store"].(bool); !ok || v {
		t.Fatalf("expected store=false to be preserved, got %#v", got["store"])
	}
}

func TestResolveUpstreamWSURLUsesResponsesHeader(t *testing.T) {
	ch := &model.Channel{
		Headers: model.JSON{
			"x-upstream-responses-url": "https://api.example.com/v1",
		},
	}

	got := resolveUpstreamWSURL(ch, "gpt-upstream", nil)
	want := "wss://api.example.com/v1/responses"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestResponsesUsageFromEventNormalizesCachedTokens(t *testing.T) {
	usage := responsesUsageFromEvent(map[string]interface{}{
		"usage": map[string]interface{}{
			"input_tokens":  float64(12),
			"output_tokens": float64(7),
			"input_token_details": map[string]interface{}{
				"cached_tokens": float64(3),
			},
		},
	})

	if usage == nil {
		t.Fatal("expected usage")
	}
	if usage["prompt_tokens"] != int64(12) || usage["completion_tokens"] != int64(7) || usage["total_tokens"] != int64(19) {
		t.Fatalf("unexpected usage: %#v", usage)
	}
	if usage["cache_read_tokens"] != int64(3) {
		t.Fatalf("expected cache_read_tokens, got %#v", usage["cache_read_tokens"])
	}
}
