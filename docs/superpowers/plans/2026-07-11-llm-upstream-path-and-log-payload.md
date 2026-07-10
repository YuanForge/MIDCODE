# LLM Upstream Path and Log Payload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treat an effective `/v1` LLM upstream URL as a whitelist-controlled base endpoint while preventing all new LLM logs from storing request and response bodies.

**Architecture:** Add a route-derived target descriptor that resolves the effective upstream URL and protocol from the already matched Gin route. Keep fixed full URLs on the existing protocol path. Remove payload fields from every HTTP, SSE, Responses WebSocket, and Realtime WebSocket log write, and make the batch writer ignore those four columns defensively while preserving the model and read API.

**Tech Stack:** Go, Gin, `net/url`, XORM-backed log models, Go table-driven tests.

---

### Task 1: Route-Derived `/v1` Upstream Targets

**Files:**
- Modify: `internal/handler/llm_upstream.go`
- Modify: `internal/handler/llm.go`
- Test: `internal/handler/llm_test.go`

- [ ] **Step 1: Write failing table tests for base URL routing**

Add tests for `/v1` and `/v1/` base URLs mapping only the matched POST routes:

```go
func TestResolveLLMUpstreamTargetFromV1Base(t *testing.T) {
    cases := []struct {
        name, baseURL, route, wantURL, wantProtocol string
        wantDynamic bool
    }{
        {"chat", "https://api.example.com/v1", "/v1/chat/completions", "https://api.example.com/v1/chat/completions", protocolOpenAI, true},
        {"responses", "https://api.example.com/v1/", "/v1/responses", "https://api.example.com/v1/responses", protocolResponses, true},
        {"compact query", "https://api.example.com/v1?api-version=2026-07-01", "/v1/responses/compact", "https://api.example.com/v1/responses/compact?api-version=2026-07-01", protocolResponses, true},
        {"fixed URL", "https://api.example.com/v1/responses", "/v1/chat/completions", "https://api.example.com/v1/responses", protocolResponses, false},
        {"not whitelisted", "https://api.example.com/v1", "/v1/unknown", "https://api.example.com/v1", protocolResponses, false},
    }
    // Call resolveLLMUpstreamTarget and compare URL, protocol, and dynamic flag.
}
```

- [ ] **Step 2: Run the focused URL tests and verify RED**

Run:

```powershell
go test ./internal/handler -run 'TestResolveLLMUpstreamTargetFromV1Base' -count=1
```

Expected: compilation failure because `resolveLLMUpstreamTarget` does not exist.

- [ ] **Step 3: Implement the minimal target resolver**

In `internal/handler/llm_upstream.go`, introduce a small result type and resolver:

```go
type llmUpstreamTarget struct {
    URL      string
    Protocol string
    Dynamic  bool
}

func resolveLLMUpstreamTarget(baseURL, route, channelProtocol, resolvedModel string, isStream bool, responsesOperation string) llmUpstreamTarget
```

Parse the final effective URL after placeholders are resolved. When `strings.TrimRight(parsed.Path, "/") == "/v1"`, use an explicit switch for:

```go
case "/v1/chat/completions":
    parsed.Path = "/v1/chat/completions"
    protocol = protocolOpenAI
case "/v1/responses":
    parsed.Path = "/v1/responses"
    protocol = protocolResponses
case "/v1/responses/compact":
    parsed.Path = "/v1/responses/compact"
    protocol = protocolResponses
default:
    return fixedTarget
```

Preserve `RawQuery`. Invalid URLs and non-`/v1` paths retain current fixed-target behavior.

- [ ] **Step 4: Run URL tests and verify GREEN**

Run:

```powershell
go test ./internal/handler -run 'TestResolveLLM(UpstreamTargetFromV1Base|TargetURLResponsesCompact)' -count=1
```

Expected: PASS.

- [ ] **Step 5: Write a failing protocol/conversion regression test**

Add a test using a Chat request containing assistant `tool_calls` and a subsequent `role: "tool"` message. Assert that a `/v1` base URL plus the matched Chat route produces effective protocol `openai`, and therefore `shouldConvertRequestBody(clientProto, effectiveProto, req)` is false.

- [ ] **Step 6: Run the regression test and verify RED**

Run:

```powershell
go test ./internal/handler -run 'TestV1BaseChatRouteKeepsToolMessagesInOpenAIProtocol' -count=1
```

Expected: FAIL until `llmProxyWithChannel` derives protocol from the resolved target.

- [ ] **Step 7: Wire the target protocol through request processing**

In `internal/handler/llm.go`, resolve the effective base URL after pool-key assignment and before conversion. Use the target protocol for request conversion, stream usage injection, response conversion, logging metadata, and `sendLLMRequest`. Pass the matched route identifier from Gin context instead of copying an untrusted raw path. Keep compact channel selection constraints unchanged.

- [ ] **Step 8: Run handler tests and verify GREEN**

Run:

```powershell
go test ./internal/handler -run 'Test(V1Base|ResolveLLM)' -count=1
```

Expected: PASS.

- [ ] **Step 9: Commit route behavior**

```powershell
git add internal/handler/llm_upstream.go internal/handler/llm.go internal/handler/llm_test.go
git commit -m "feat: route llm v1 base urls by endpoint"
```

### Task 2: Stop HTTP and SSE Payload Persistence

**Files:**
- Modify: `internal/handler/llm.go`
- Modify: `internal/handler/llm_log_writer.go`
- Test: `internal/handler/llm_log_writer_test.go`

- [ ] **Step 1: Write failing log sanitizer tests**

Add tests that enqueue or merge records containing all four payload fields and assert the persisted/merged record leaves them nil while retaining `status`, `usage`, `upstream_url`, `upstream_method`, `upstream_status`, `upstream_headers`, and `transport`.

- [ ] **Step 2: Run the log writer tests and verify RED**

Run:

```powershell
go test ./internal/handler -run 'TestLLMLogWriterDropsPayloadFields' -count=1
```

Expected: FAIL because create records and patches currently retain payloads.

- [ ] **Step 3: Add a single defensive sanitizer**

Add:

```go
func stripLLMLogPayload(record *model.LLMLog) {
    record.ClientRequest = nil
    record.UpstreamRequest = nil
    record.UpstreamResponse = nil
    record.ClientResponse = nil
}
```

Call it for inserts and before direct/batched persistence. Ignore the four payload column names in `applyLLMLogPatch` instead of adding them to `patchCols`.

- [ ] **Step 4: Remove HTTP/SSE payload construction**

Remove the four fields from the initial HTTP log record and remove response payload fields from non-streaming and SSE patch calls. Keep response data in local variables for conversion, streaming, usage extraction, billing, and client output.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
go test ./internal/handler -run 'TestLLMLogWriterDropsPayloadFields' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit HTTP/SSE logging changes**

```powershell
git add internal/handler/llm.go internal/handler/llm_log_writer.go internal/handler/llm_log_writer_test.go
git commit -m "feat: stop storing llm http payload bodies"
```

### Task 3: Stop WebSocket Payload Persistence

**Files:**
- Modify: `internal/handler/responses_ws.go`
- Modify: `internal/handler/realtime_ws.go`
- Test: `internal/handler/responses_ws_test.go`
- Test: `internal/handler/realtime_ws_test.go`

- [ ] **Step 1: Write failing record-construction tests**

Extract or test small record-builder helpers for Responses WS and Realtime WS. Supply non-empty request/response maps and assert the resulting `LLMLog` contains transport, URL, method, status, headers, model, and pricing metadata but all four payload fields are nil.

- [ ] **Step 2: Run WebSocket tests and verify RED**

Run:

```powershell
go test ./internal/handler -run 'Test(ResponsesWS|RealtimeWS)LogOmitsPayloadBodies' -count=1
```

Expected: FAIL while current insert and patch code retains payloads.

- [ ] **Step 3: Remove Responses WebSocket payload writes**

Delete request payload fields from the insert. Change success patches to update only `upstream_status`; keep status/error/usage settlement behavior intact. Remove raw SSE/WS message accumulation that exists only for log persistence.

- [ ] **Step 4: Remove Realtime WebSocket payload writes**

Delete request payload fields from the insert. On error patch only `status` and `error_msg`; on success rely on settlement metadata. Keep session state required for usage extraction, but do not materialize log JSON payloads.

- [ ] **Step 5: Run WebSocket tests and verify GREEN**

Run:

```powershell
go test ./internal/handler -run 'Test(ResponsesWS|RealtimeWS)LogOmitsPayloadBodies' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit WebSocket logging changes**

```powershell
git add internal/handler/responses_ws.go internal/handler/realtime_ws.go internal/handler/responses_ws_test.go internal/handler/realtime_ws_test.go
git commit -m "feat: stop storing llm websocket payload bodies"
```

### Task 4: Regression Verification and Review

**Files:**
- Verify: `internal/handler/*.go`
- Verify: `internal/protocol/*.go`
- Verify: `docs/superpowers/specs/2026-07-10-llm-upstream-path-and-log-payload-design.md`

- [ ] **Step 1: Format modified Go files**

Run:

```powershell
gofmt -w internal/handler/llm_upstream.go internal/handler/llm.go internal/handler/llm_log_writer.go internal/handler/llm_log_writer_test.go internal/handler/responses_ws.go internal/handler/responses_ws_test.go internal/handler/realtime_ws.go internal/handler/realtime_ws_test.go
```

- [ ] **Step 2: Run targeted packages**

Run:

```powershell
go test ./internal/protocol ./internal/handler -count=1
```

Expected: PASS.

- [ ] **Step 3: Run full repository tests**

Run:

```powershell
go test ./... -count=1
```

Expected: PASS.

- [ ] **Step 4: Inspect for forbidden payload writes**

Run:

```powershell
rg -n 'ClientRequest:|UpstreamRequest:|ClientResponse:|UpstreamResponse:|client_request|upstream_request|client_response|upstream_response' internal/handler
```

Expected: model/read compatibility may remain, but no new LLM production insert or patch path writes any of the four payload fields.

- [ ] **Step 5: Review diff against the approved design**

Run:

```powershell
git diff main...HEAD --stat
git diff main...HEAD
git status --short
```

Confirm only the approved routing, tests, log payload omission, and plan files changed.

- [ ] **Step 6: Final commit**

```powershell
git add docs/superpowers/plans/2026-07-11-llm-upstream-path-and-log-payload.md
git commit -m "docs: add llm upstream implementation plan"
```
