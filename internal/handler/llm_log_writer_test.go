package handler

import (
	"strings"
	"testing"
	"unicode/utf8"

	"fanapi/internal/model"
)

func TestLLMLogWriterDropsPayloadFieldsFromCreateAndPatch(t *testing.T) {
	state := &llmLogPending{patchCols: map[string]bool{}}
	applyLLMLogPatch(state, []string{
		"status",
		"usage",
		"upstream_url",
		"upstream_method",
		"upstream_status",
		"upstream_headers",
		"transport",
		"client_request",
		"upstream_request",
		"client_response",
		"upstream_response",
	}, model.LLMLog{
		Status:           "ok",
		Usage:            model.JSON{"total_tokens": 10},
		UpstreamURL:      "https://api.example.com/v1/chat/completions",
		UpstreamMethod:   "POST",
		UpstreamStatus:   200,
		UpstreamHeaders:  model.JSON{"Content-Type": "application/json"},
		Transport:        "http",
		ClientRequest:    model.JSON{"prompt": "client"},
		UpstreamRequest:  model.JSON{"prompt": "upstream"},
		ClientResponse:   model.JSON{"answer": "client"},
		UpstreamResponse: model.JSON{"answer": "upstream"},
	})

	if state.record.Status != "ok" || state.record.Transport != "http" || state.record.UpstreamStatus != 200 {
		t.Fatalf("metadata was not preserved: %#v", state.record)
	}
	if state.record.Usage == nil || state.record.UpstreamHeaders == nil || state.record.UpstreamURL == "" || state.record.UpstreamMethod == "" {
		t.Fatalf("expected metadata fields to remain: %#v", state.record)
	}
	if state.record.ClientRequest != nil || state.record.UpstreamRequest != nil || state.record.ClientResponse != nil || state.record.UpstreamResponse != nil {
		t.Fatalf("payload fields must be dropped: %#v", state.record)
	}
	for _, col := range []string{"client_request", "upstream_request", "client_response", "upstream_response"} {
		if state.patchCols[col] {
			t.Fatalf("payload column %q should not be marked for persistence", col)
		}
	}

	record := model.LLMLog{
		Status:           "pending",
		ClientRequest:    model.JSON{"prompt": "client"},
		UpstreamRequest:  model.JSON{"prompt": "upstream"},
		ClientResponse:   model.JSON{"answer": "client"},
		UpstreamResponse: model.JSON{"answer": "upstream"},
	}
	stripLLMLogPayload(&record)
	if record.Status != "pending" {
		t.Fatalf("expected metadata to remain on create sanitize, got %#v", record.Status)
	}
	if record.ClientRequest != nil || record.UpstreamRequest != nil || record.ClientResponse != nil || record.UpstreamResponse != nil {
		t.Fatalf("create payload fields must be dropped: %#v", record)
	}
}

func TestStripLLMLogPayloadLimitsAndSanitizesErrorSummary(t *testing.T) {
	record := model.LLMLog{ErrorMsg: "safe\x00" + string([]byte{'x', 0xff}) + strings.Repeat("错", maxLLMLogErrorSummaryBytes)}
	stripLLMLogPayload(&record)
	if len(record.ErrorMsg) > maxLLMLogErrorSummaryBytes {
		t.Fatalf("error summary exceeded %d bytes: %d", maxLLMLogErrorSummaryBytes, len(record.ErrorMsg))
	}
	if !utf8.ValidString(record.ErrorMsg) {
		t.Fatalf("error summary is not valid UTF-8: %q", record.ErrorMsg)
	}
	if strings.ContainsRune(record.ErrorMsg, '\x00') {
		t.Fatalf("error summary retained NUL: %q", record.ErrorMsg)
	}

	shortInvalidRecord := model.LLMLog{ErrorMsg: string([]byte{'s', 'h', 'o', 'r', 't', 0xff})}
	stripLLMLogPayload(&shortInvalidRecord)
	if !utf8.ValidString(shortInvalidRecord.ErrorMsg) {
		t.Fatalf("short error summary is not valid UTF-8: %q", shortInvalidRecord.ErrorMsg)
	}
}
