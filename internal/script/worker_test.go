package script

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fanapi/internal/model"
)

func TestExecJobTreatsHTTP500AsRetryableFailure(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"message":"temporary upstream failure"}`))
	}))
	defer upstream.Close()

	result := execJob(context.Background(), &model.TaskJob{
		TaskID:          1,
		TaskType:        "image",
		ChannelID:       10,
		BaseURL:         upstream.URL,
		Method:          http.MethodPost,
		Headers:         map[string]interface{}{},
		TimeoutMs:       1000,
		Payload:         map[string]interface{}{"model": "gpt-image-2", "prompt": "test"},
		RetryChannelIDs: []int64{20},
	})

	if result.Outcome != model.OutcomeFailed {
		t.Fatalf("expected HTTP 500 to fail for channel retry, got outcome=%q result=%#v", result.Outcome, result.Result)
	}
	if !strings.Contains(result.ErrorMsg, "500") {
		t.Fatalf("expected status code in error, got %q", result.ErrorMsg)
	}
	if len(result.RetryChannelIDs) != 1 || result.RetryChannelIDs[0] != 20 {
		t.Fatalf("expected retry channels to be preserved, got %#v", result.RetryChannelIDs)
	}
}

func TestNormalizeOpenAIImageResponseBase64(t *testing.T) {
	input := map[string]interface{}{
		"data": []interface{}{
			map[string]interface{}{"b64_json": "iVBORw0KGgoAAAANSUhEUg=="},
		},
	}

	got := normalizeOpenAIImageResponse(input)
	if got["code"] != 200 || got["status"] != 2 {
		t.Fatalf("expected successful task result, got %#v", got)
	}
	if got["url"] != "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" {
		t.Fatalf("unexpected image URL: %#v", got["url"])
	}
}

func TestNormalizeOpenAIImageResponseMultipleImages(t *testing.T) {
	input := map[string]interface{}{
		"data": []interface{}{
			map[string]interface{}{"url": "https://cdn.example.com/first.png"},
			map[string]interface{}{"b64_json": "UklGRhIAAABXRUJQVlA="},
		},
	}

	got := normalizeOpenAIImageResponse(input)
	urls, ok := got["url"].([]interface{})
	if !ok || len(urls) != 2 {
		t.Fatalf("expected two image URLs, got %#v", got["url"])
	}
	if urls[0] != "https://cdn.example.com/first.png" {
		t.Fatalf("unexpected first URL: %#v", urls[0])
	}
	if urls[1] != "data:image/webp;base64,UklGRhIAAABXRUJQVlA=" {
		t.Fatalf("unexpected second URL: %#v", urls[1])
	}
}

func TestNormalizeOpenAIImageResponseLeavesOtherResponsesUntouched(t *testing.T) {
	input := map[string]interface{}{"id": "upstream-task-id"}

	got := normalizeOpenAIImageResponse(input)
	if got["id"] != input["id"] || len(got) != len(input) {
		t.Fatalf("expected response to remain unchanged, got %#v", got)
	}
}
