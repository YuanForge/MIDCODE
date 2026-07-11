# LLM Error Summary and Pool-Key Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep LLM error logs small and make each pool-key retry use the correct effective upstream protocol and request body.

**Architecture:** Centralize bounded error-body summarization in the LLM handler package. Centralize per-Key upstream attempt preparation so the initial request and every Key rotation derive URL, protocol, conversion and script output from the same original request map.

**Tech Stack:** Go, Gin, XORM, net/http, existing protocol and script packages, Go table-driven tests.

---

### Task 1: Add failing error-summary regression tests

**Files:**
- Modify: `internal/handler/llm_test.go`

- [ ] **Step 1: Add a test for structured errors and raw-body exclusion**

```go
func TestSummarizeLLMUpstreamErrorKeepsStructuredMessageWithoutRawBody(t *testing.T) {
    body := []byte(`{"error":{"message":"invalid key","trace":"secret response body"}}`)
    got := summarizeLLMUpstreamError(http.StatusUnauthorized, body)
    if got != "上游返回 401: invalid key" { t.Fatalf("got %q", got) }
    if strings.Contains(got, "secret response body") { t.Fatal("raw response leaked") }
}
```

- [ ] **Step 2: Add a test for large unstructured errors and the 4 KiB limit**

```go
func TestSummarizeLLMUpstreamErrorBoundsUnstructuredBody(t *testing.T) {
    got := summarizeLLMUpstreamError(http.StatusBadGateway, bytes.Repeat([]byte("x"), 128*1024))
    if got != "上游返回 502" || len(got) > maxLLMLogErrorSummaryBytes { t.Fatalf("got %q", got) }
}
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `go test ./internal/handler -run TestSummarizeLLMUpstreamError -count=1`

Expected: compilation failure because the summarizer does not exist.

### Task 2: Add failing per-Key request-preparation tests

**Files:**
- Modify: `internal/handler/llm_test.go`

- [ ] **Step 1: Add a test for a fixed Responses Key and a `/v1` Chat Key**

```go
func TestPrepareLLMUpstreamAttemptRebuildsBodyForEachPoolKey(t *testing.T) {
    // Build a Responses attempt, then a /v1 Chat attempt from the same original request.
    // Assert protocol, URL and body shape differ correctly, with no stale `input` field on Chat.
}
```

- [ ] **Step 2: Add a test that request scripts receive the current Key value**

```go
func TestPrepareLLMUpstreamAttemptRunsRequestScriptForCurrentPoolKey(t *testing.T) {
    // A script exposes the current pool key in a request field; two calls must produce two key-specific values.
}
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `go test ./internal/handler -run TestPrepareLLMUpstreamAttempt -count=1`

Expected: compilation failure because per-Key preparation is not centralized.

### Task 3: Implement bounded summaries and per-Key preparation

**Files:**
- Modify: `internal/handler/llm.go`
- Modify: `internal/handler/llm_billing.go` if the error-boundary helper belongs there
- Modify: `internal/handler/responses_ws.go`

- [ ] **Step 1: Implement the error summary helper and use a bounded reader in each non-200 LLM response path**

```go
const maxLLMLogErrorSummaryBytes = 4 * 1024
const maxLLMUpstreamErrorBodyBytes = 64 * 1024

func summarizeLLMUpstreamError(status int, body []byte) string {
    // detect a structured business message; otherwise return the status-only summary;
    // always bound the result before it reaches LLMLog.ErrorMsg.
}
```

- [ ] **Step 2: Implement a per-Key attempt builder**

```go
func prepareLLMUpstreamAttempt(c *gin.Context, ch *model.Channel, poolKey *model.PoolKey,
    source map[string]interface{}, clientProto, resolvedModel string, isStream bool, op string) (llmUpstreamAttempt, error) {
    // resolve effective target, convert/source-map, apply request script, then protocol-specific fields.
}
```

- [ ] **Step 3: Replace the initial and rotated-Key preparation blocks in `llmProxyWithChannel`**

```go
attempt, err := prepareLLMUpstreamAttempt(..., poolKey, origReqData, ...)
// On every rotation: assign newKey, call the same helper, then send attempt.Request with attempt.Protocol.
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `go test ./internal/handler -run 'Test(SummarizeLLMUpstreamError|PrepareLLMUpstreamAttempt)' -count=1`

Expected: PASS.

### Task 4: Regression verification and review

**Files:**
- Verify: `internal/handler/*.go`
- Verify: `internal/protocol/*.go`

- [ ] **Step 1: Format affected Go files**

Run: `gofmt -w internal/handler/llm.go internal/handler/llm_billing.go internal/handler/responses_ws.go internal/handler/llm_test.go`

- [ ] **Step 2: Run handler and full Go suites**

Run: `go test ./internal/handler -count=1; go test ./... -count=1`

Expected: PASS.

- [ ] **Step 3: Review the final diff for raw error writes and stale retry state**

Run: `rg -n 'ErrorMsg: string\\(bodyErr\\)|string\\(bodyErr\\)' internal/handler; git diff --check`

Expected: no LLM log write receives raw error body; no whitespace errors.
