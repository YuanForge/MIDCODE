package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fanapi/internal/model"
	"fanapi/internal/protocol"

	"github.com/gin-gonic/gin"
)

func TestShouldConvertRequestBodyResponsesToResponsesWithMessages(t *testing.T) {
	reqData := map[string]interface{}{
		"messages": []interface{}{
			map[string]interface{}{"role": "user", "content": "hello"},
		},
	}

	if !shouldConvertRequestBody(protocolResponses, protocolResponses, reqData) {
		t.Fatal("expected conversion for responses->responses when top-level messages is non-empty")
	}
}

func TestShouldConvertRequestBodyResponsesToResponsesNativeInput(t *testing.T) {
	reqData := map[string]interface{}{
		"input": []interface{}{
			map[string]interface{}{
				"role": "user",
				"content": []interface{}{
					map[string]interface{}{"type": "input_text", "text": "hello"},
				},
			},
		},
	}

	if shouldConvertRequestBody(protocolResponses, protocolResponses, reqData) {
		t.Fatal("expected no conversion for native responses input without top-level messages")
	}
}

func TestShouldConvertRequestBodyResponsesNativeAssistantOutputTextPreserved(t *testing.T) {
	reqData := map[string]interface{}{
		"input": []interface{}{
			map[string]interface{}{
				"role": "assistant",
				"content": []interface{}{
					map[string]interface{}{"type": "output_text", "text": "你好"},
				},
			},
		},
	}

	if shouldConvertRequestBody(protocolResponses, protocolResponses, reqData) {
		t.Fatal("expected no conversion for native responses input")
	}

	input, _ := reqData["input"].([]interface{})
	item, _ := input[0].(map[string]interface{})
	content, _ := item["content"].([]interface{})
	part, _ := content[0].(map[string]interface{})
	if part["type"] != "output_text" {
		t.Fatalf("expected assistant output_text part preserved, got %#v", part["type"])
	}

	normalized, err := protocol.NormalizeClientRequest(reqData, protocolResponses)
	if err != nil {
		t.Fatalf("unexpected normalize error: %v", err)
	}
	roundTripped, err := protocol.ConvertRequest(normalized, protocolResponses)
	if err != nil {
		t.Fatalf("unexpected convert error: %v", err)
	}
	rtInput, _ := roundTripped["input"].([]interface{})
	rtItem, _ := rtInput[0].(map[string]interface{})
	if _, isString := rtItem["content"].(string); !isString {
		t.Fatalf("expected current round-trip to alter assistant content shape for regression context, got %#v", rtItem["content"])
	}
}

func TestResolveLLMTargetURLResponsesCompact(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "responses endpoint",
			in:   "https://api.openai.com/v1/responses",
			want: "https://api.openai.com/v1/responses/compact",
		},
		{
			name: "responses endpoint with query",
			in:   "https://api.example.com/v1/responses?api-version=2026-05-01",
			want: "https://api.example.com/v1/responses/compact?api-version=2026-05-01",
		},
		{
			name: "already compact",
			in:   "https://api.example.com/v1/responses/compact",
			want: "https://api.example.com/v1/responses/compact",
		},
		{
			name: "base v1 endpoint",
			in:   "https://api.example.com/v1",
			want: "https://api.example.com/v1/responses/compact",
		},
		{
			name: "chat completions endpoint",
			in:   "https://api.example.com/v1/chat/completions",
			want: "https://api.example.com/v1/responses/compact",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := resolveLLMTargetURL(tc.in, "gpt-test", false, responsesOperationCompact)
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestResolveLLMTargetURLResponsesCompactWithModelPlaceholder(t *testing.T) {
	got := resolveLLMTargetURL("https://api.example.com/v1/models/{model}/responses", "gpt-test", false, responsesOperationCompact)
	if got != "https://api.example.com/v1/models/gpt-test/responses/compact" {
		t.Fatalf("unexpected target URL: %q", got)
	}
}

func TestResolveLLMTargetURLGeminiStreamUnchanged(t *testing.T) {
	got := resolveLLMTargetURL("https://generativelanguage.googleapis.com/v1beta/models/{model}:{stream_action}", "gemini-test", true, "")
	if !strings.Contains(got, "/gemini-test:streamGenerateContent") || !strings.HasSuffix(got, "?alt=sse") {
		t.Fatalf("unexpected Gemini stream URL: %q", got)
	}
}

func TestResolveLLMUpstreamTargetFromV1Base(t *testing.T) {
	tests := []struct {
		name         string
		baseURL      string
		route        string
		channelProto string
		operation    string
		wantURL      string
		wantProto    string
		wantDynamic  bool
	}{
		{
			name:         "chat completions",
			baseURL:      "https://api.example.com/v1",
			route:        "/v1/chat/completions",
			channelProto: protocolResponses,
			wantURL:      "https://api.example.com/v1/chat/completions",
			wantProto:    protocolOpenAI,
			wantDynamic:  true,
		},
		{
			name:         "responses with trailing slash",
			baseURL:      "https://api.example.com/v1/",
			route:        "/v1/responses",
			channelProto: protocolOpenAI,
			wantURL:      "https://api.example.com/v1/responses",
			wantProto:    protocolResponses,
			wantDynamic:  true,
		},
		{
			name:         "responses compact preserves query",
			baseURL:      "https://api.example.com/v1?api-version=2026-07-01",
			route:        "/v1/responses/compact",
			channelProto: protocolResponses,
			operation:    responsesOperationCompact,
			wantURL:      "https://api.example.com/v1/responses/compact?api-version=2026-07-01",
			wantProto:    protocolResponses,
			wantDynamic:  true,
		},
		{
			name:         "fixed full URL keeps channel protocol",
			baseURL:      "https://api.example.com/v1/responses",
			route:        "/v1/chat/completions",
			channelProto: protocolResponses,
			wantURL:      "https://api.example.com/v1/responses",
			wantProto:    protocolResponses,
			wantDynamic:  false,
		},
		{
			name:         "non whitelist route is not appended",
			baseURL:      "https://api.example.com/v1",
			route:        "/v1/unknown",
			channelProto: protocolResponses,
			wantURL:      "https://api.example.com/v1",
			wantProto:    protocolResponses,
			wantDynamic:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveLLMUpstreamTarget(tt.baseURL, tt.route, tt.channelProto, "gpt-test", false, tt.operation)
			if got.URL != tt.wantURL {
				t.Fatalf("URL: expected %q, got %q", tt.wantURL, got.URL)
			}
			if got.Protocol != tt.wantProto {
				t.Fatalf("protocol: expected %q, got %q", tt.wantProto, got.Protocol)
			}
			if got.Dynamic != tt.wantDynamic {
				t.Fatalf("dynamic: expected %v, got %v", tt.wantDynamic, got.Dynamic)
			}
		})
	}
}

func TestV1BaseChatRouteKeepsToolMessagesInOpenAIProtocol(t *testing.T) {
	reqData := map[string]interface{}{
		"messages": []interface{}{
			map[string]interface{}{
				"role": "assistant",
				"tool_calls": []interface{}{
					map[string]interface{}{
						"id":   "call_1",
						"type": "function",
						"function": map[string]interface{}{
							"name":      "lookup",
							"arguments": `{"id":1}`,
						},
					},
				},
			},
			map[string]interface{}{
				"role":         "tool",
				"tool_call_id": "call_1",
				"content":      "result",
			},
		},
	}

	target := resolveLLMUpstreamTarget(
		"https://api.example.com/v1",
		"/v1/chat/completions",
		protocolResponses,
		"gpt-test",
		false,
		"",
	)
	if target.Protocol != protocolOpenAI {
		t.Fatalf("expected route-derived OpenAI protocol, got %q", target.Protocol)
	}
	if shouldConvertRequestBody(protocolOpenAI, target.Protocol, reqData) {
		t.Fatal("expected Chat tool messages to bypass Responses conversion")
	}
}

func TestSendLLMRequestDoesNotForwardClientAcceptEncoding(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var upstreamAcceptEncoding string
	var upstreamUserAgent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamAcceptEncoding = r.Header.Get("Accept-Encoding")
		upstreamUserAgent = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer server.Close()

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-test"}`))
	req.Header.Set("Accept-Encoding", "br, zstd")
	req.Header.Set("User-Agent", "fanapi-test-client")
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req

	ch := &model.Channel{
		BaseURL:            server.URL,
		PassthroughHeaders: true,
		TimeoutMs:          1000,
	}

	_, resp, err := sendLLMRequest(c, ch, map[string]interface{}{"model": "gpt-test"}, nil, protocolOpenAI, "gpt-test", false)
	if err != nil {
		t.Fatalf("sendLLMRequest failed: %v", err)
	}
	defer resp.Body.Close()

	if strings.Contains(upstreamAcceptEncoding, "br") || strings.Contains(upstreamAcceptEncoding, "zstd") {
		t.Fatalf("client Accept-Encoding was forwarded upstream: %q", upstreamAcceptEncoding)
	}
	if upstreamUserAgent != "fanapi-test-client" {
		t.Fatalf("expected ordinary passthrough header to remain, got User-Agent %q", upstreamUserAgent)
	}
}

func TestSendLLMRequestAppendsMatchedRouteForV1Base(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var upstreamPath string
	var upstreamRawQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamPath = r.URL.Path
		upstreamRawQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer server.Close()

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-test"}`))
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req
	c.Set(llmRouteContextKey, "/v1/chat/completions")

	ch := &model.Channel{
		BaseURL:   server.URL + "/v1?api-version=2026-07-01",
		Protocol:  protocolResponses,
		TimeoutMs: 1000,
	}

	_, resp, err := sendLLMRequest(c, ch, map[string]interface{}{"model": "gpt-test"}, nil, protocolOpenAI, "gpt-test", false)
	if err != nil {
		t.Fatalf("sendLLMRequest failed: %v", err)
	}
	defer resp.Body.Close()

	if upstreamPath != "/v1/chat/completions" {
		t.Fatalf("expected upstream path /v1/chat/completions, got %q", upstreamPath)
	}
	if upstreamRawQuery != "api-version=2026-07-01" {
		t.Fatalf("expected configured query preserved, got %q", upstreamRawQuery)
	}
}

func TestReadLLMUpstreamErrorBodyLimitsBytes(t *testing.T) {
	got, err := readLLMUpstreamErrorBody(strings.NewReader(strings.Repeat("x", maxLLMUpstreamErrorBodyBytes+512)))
	if err != nil {
		t.Fatalf("read error body: %v", err)
	}
	if len(got) != maxLLMUpstreamErrorBodyBytes {
		t.Fatalf("expected %d bytes, got %d", maxLLMUpstreamErrorBodyBytes, len(got))
	}
}

func TestSummarizeLLMUpstreamErrorKeepsStructuredMessageWithoutRawBody(t *testing.T) {
	body := []byte(`{"error":{"message":"invalid key","trace":"secret upstream response"}}`)
	got := summarizeLLMUpstreamError(http.StatusUnauthorized, body)
	if want := "上游返回 401: invalid key"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(got, "secret upstream response") {
		t.Fatalf("raw upstream response leaked into summary: %q", got)
	}
}

func TestSummarizeLLMUpstreamErrorDropsUnstructuredBody(t *testing.T) {
	body := []byte("<html>private upstream error " + strings.Repeat("x", 128*1024) + "</html>")
	got := summarizeLLMUpstreamError(http.StatusBadGateway, body)
	if want := "上游返回 502"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if len(got) > maxLLMLogErrorSummaryBytes {
		t.Fatalf("summary exceeded %d bytes: %d", maxLLMLogErrorSummaryBytes, len(got))
	}
}

func TestPrepareLLMUpstreamAttemptRebuildsBodyForEachPoolKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(llmRouteContextKey, "/v1/chat/completions")

	ch := &model.Channel{
		BaseURL:  "https://fallback.example/v1/responses",
		Protocol: protocolResponses,
	}
	source := map[string]interface{}{
		"model": "gpt-test",
		"messages": []interface{}{
			map[string]interface{}{"role": "user", "content": "hello"},
		},
	}

	responsesKey := &model.PoolKey{Value: "responses-key", BaseURLOverride: "https://responses.example/v1/responses"}
	responsesAttempt, err := prepareLLMUpstreamAttempt(c, ch, responsesKey, source, protocolOpenAI, "gpt-test", false, "")
	if err != nil {
		t.Fatalf("prepare Responses attempt: %v", err)
	}
	if responsesAttempt.Protocol != protocolResponses || responsesAttempt.Target.URL != "https://responses.example/v1/responses" {
		t.Fatalf("unexpected Responses target: %#v", responsesAttempt)
	}
	if _, ok := responsesAttempt.Request["input"]; !ok {
		t.Fatalf("Responses request must contain input: %#v", responsesAttempt.Request)
	}
	if _, ok := responsesAttempt.Request["messages"]; ok {
		t.Fatalf("Responses request retained stale messages: %#v", responsesAttempt.Request)
	}

	chatKey := &model.PoolKey{Value: "chat-key", BaseURLOverride: "https://chat.example/v1"}
	chatAttempt, err := prepareLLMUpstreamAttempt(c, ch, chatKey, source, protocolOpenAI, "gpt-test", false, "")
	if err != nil {
		t.Fatalf("prepare Chat attempt: %v", err)
	}
	if chatAttempt.Protocol != protocolOpenAI || chatAttempt.Target.URL != "https://chat.example/v1/chat/completions" {
		t.Fatalf("unexpected Chat target: %#v", chatAttempt)
	}
	if _, ok := chatAttempt.Request["messages"]; !ok {
		t.Fatalf("Chat request must restore messages: %#v", chatAttempt.Request)
	}
	if _, ok := chatAttempt.Request["input"]; ok {
		t.Fatalf("Chat request retained stale Responses input: %#v", chatAttempt.Request)
	}
}

func TestPrepareLLMUpstreamAttemptRunsRequestScriptForCurrentPoolKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(llmRouteContextKey, "/v1/chat/completions")

	ch := &model.Channel{
		BaseURL:       "https://api.example/v1",
		Protocol:      protocolOpenAI,
		RequestScript: `function mapRequest(input) { return { model: input.model, key_marker: poolKey }; }`,
	}
	source := map[string]interface{}{"model": "gpt-test"}

	first, err := prepareLLMUpstreamAttempt(c, ch, &model.PoolKey{Value: "first-key"}, source, protocolOpenAI, "gpt-test", false, "")
	if err != nil {
		t.Fatalf("prepare first attempt: %v", err)
	}
	second, err := prepareLLMUpstreamAttempt(c, ch, &model.PoolKey{Value: "second-key"}, source, protocolOpenAI, "gpt-test", false, "")
	if err != nil {
		t.Fatalf("prepare second attempt: %v", err)
	}
	if first.Request["key_marker"] != "first-key" || second.Request["key_marker"] != "second-key" {
		t.Fatalf("request script reused stale key: first=%#v second=%#v", first.Request, second.Request)
	}
}

func TestPrepareLLMUpstreamAttemptDoesNotMutateSourceStreamOptions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(llmRouteContextKey, "/v1/chat/completions")

	sourceOptions := map[string]interface{}{"custom": true}
	source := map[string]interface{}{
		"model":          "gpt-test",
		"stream":         true,
		"stream_options": sourceOptions,
	}
	attempt, err := prepareLLMUpstreamAttempt(c, &model.Channel{BaseURL: "https://api.example/v1"}, nil, source, protocolOpenAI, "gpt-test", true, "")
	if err != nil {
		t.Fatalf("prepare attempt: %v", err)
	}
	attemptOptions, _ := attempt.Request["stream_options"].(map[string]interface{})
	if attemptOptions["include_usage"] != true {
		t.Fatalf("prepared request is missing include_usage: %#v", attempt.Request)
	}
	if _, leaked := sourceOptions["include_usage"]; leaked {
		t.Fatalf("prepared request mutated source options: %#v", sourceOptions)
	}
}

func TestPrepareLLMUpstreamAttemptSkipsScriptForPassthroughBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(llmRouteContextKey, "/v1/chat/completions")

	ch := &model.Channel{
		BaseURL:         "https://api.example/v1/responses",
		Protocol:        protocolResponses,
		PassthroughBody: true,
		RequestScript:   "not valid JavaScript",
	}
	attempt, err := prepareLLMUpstreamAttempt(c, ch, &model.PoolKey{BaseURLOverride: "https://api.example/v1"}, map[string]interface{}{"model": "gpt-test"}, protocolOpenAI, "gpt-test", false, "")
	if err != nil {
		t.Fatalf("passthrough body must skip request script: %v", err)
	}
	if attempt.Protocol != protocolOpenAI || attempt.Target.URL != "https://api.example/v1/chat/completions" {
		t.Fatalf("passthrough attempt did not derive the current key target: %#v", attempt)
	}
}

func TestPrepareLLMUpstreamAttemptKeepsResponsesCompactBodyUnconverted(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses/compact", nil)
	c.Set(llmRouteContextKey, "/v1/responses/compact")

	source := map[string]interface{}{
		"model": "gpt-test",
		"messages": []interface{}{
			map[string]interface{}{"role": "user", "content": "hello"},
		},
	}
	attempt, err := prepareLLMUpstreamAttempt(c, &model.Channel{BaseURL: "https://api.example/v1", Protocol: protocolResponses}, nil, source, protocolOpenAI, "gpt-test", false, responsesOperationCompact)
	if err != nil {
		t.Fatalf("prepare compact attempt: %v", err)
	}
	if attempt.Protocol != protocolResponses || attempt.Target.URL != "https://api.example/v1/responses/compact" {
		t.Fatalf("unexpected compact target: %#v", attempt)
	}
	if _, ok := attempt.Request["messages"]; !ok {
		t.Fatalf("compact request should retain its original body: %#v", attempt.Request)
	}
	if _, ok := attempt.Request["input"]; ok {
		t.Fatalf("compact request should not be automatically converted: %#v", attempt.Request)
	}
}

func TestResponsesPassthroughSSEFilterDropsEmptyChatCompletionChunk(t *testing.T) {
	filter := &responsesPassthroughSSEFilter{}
	input := []string{
		"event: ",
		`data: {"id":"chatcmpl-dummy","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}`,
		"",
		"event: response.created",
		`data: {"type":"response.created","response":{"id":"resp_1","status":"in_progress"}}`,
		"",
	}

	var got []string
	for _, line := range input {
		got = append(got, filter.Convert(line)...)
	}
	got = append(got, filter.Flush()...)

	want := []string{
		"event: response.created",
		`data: {"type":"response.created","response":{"id":"resp_1","status":"in_progress"}}`,
		"",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("unexpected filtered SSE:\nwant %q\ngot  %q", strings.Join(want, "\n"), strings.Join(got, "\n"))
	}
}

func TestResponsesPassthroughSSEFilterKeepsNonEmptyChatCompletionChunk(t *testing.T) {
	filter := &responsesPassthroughSSEFilter{}
	input := []string{
		`data: {"id":"chatcmpl-real","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"hello"}}]}`,
		"",
	}

	var got []string
	for _, line := range input {
		got = append(got, filter.Convert(line)...)
	}

	if strings.Join(got, "\n") != strings.Join(input, "\n") {
		t.Fatalf("expected non-empty chat chunk to pass through, got %q", strings.Join(got, "\n"))
	}
}

func TestResponsesPassthroughSSEFilterFlushesTrailingResponsesBlock(t *testing.T) {
	filter := &responsesPassthroughSSEFilter{}
	_ = filter.Convert("event: response.completed")
	_ = filter.Convert(`data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}`)

	got := filter.Flush()
	want := []string{
		"event: response.completed",
		`data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}`,
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("expected trailing responses block to flush, got %q", strings.Join(got, "\n"))
	}
}
