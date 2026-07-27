# FanAPI Long-Stream and Responses WebSocket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow long-running LLM streams to exceed the channel's total HTTP timeout and make Responses WebSocket continuations reach and remain on one upstream route.

**Architecture:** Keep non-streaming channel timeouts unchanged, but construct streaming HTTP clients without a total-duration cutoff so request cancellation and proxy idle timeouts control their lifetime. Add per-client-WebSocket route state for continuation turns, and use an exact Nginx `/v1/responses` location to support POST/SSE and GET/Upgrade with 1800-second response idle limits.

**Tech Stack:** Go, Gin, Gorilla WebSocket, Nginx, Go testing, Docker

---

### Task 1: Streaming HTTP Client Timeout

**Files:**
- Modify: `internal/handler/llm_upstream.go`
- Create: `internal/handler/llm_upstream_timeout_test.go`

- [ ] **Step 1: Write the failing timeout-selection test**

Add tests that require `newLLMHTTPClient` to retain the configured timeout for non-streaming requests and use a zero total timeout for streaming requests:

```go
func TestNewLLMHTTPClientUsesConfiguredTimeoutForNonStream(t *testing.T) {
    client := newLLMHTTPClient(60*time.Second, false)
    if client.Timeout != 60*time.Second {
        t.Fatalf("timeout = %s, want 1m0s", client.Timeout)
    }
}

func TestNewLLMHTTPClientHasNoTotalTimeoutForStream(t *testing.T) {
    client := newLLMHTTPClient(60*time.Second, true)
    if client.Timeout != 0 {
        t.Fatalf("timeout = %s, want 0", client.Timeout)
    }
}
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `go test ./internal/handler -run TestNewLLMHTTPClient -count=1`

Expected: build failure because `newLLMHTTPClient` is undefined.

- [ ] **Step 3: Implement the minimal client constructor**

Add:

```go
func newLLMHTTPClient(timeout time.Duration, isStream bool) *http.Client {
    if isStream {
        timeout = 0
    }
    return &http.Client{Timeout: timeout}
}
```

Replace the inline `&http.Client{Timeout: timeout}` in `sendLLMRequest` with `newLLMHTTPClient(timeout, isStream)`.

- [ ] **Step 4: Run focused tests**

Run: `go test ./internal/handler -run TestNewLLMHTTPClient -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the streaming timeout change**

```powershell
git add -- internal/handler/llm_upstream.go internal/handler/llm_upstream_timeout_test.go
git commit -m "fix: remove total timeout from llm streams"
```

### Task 2: Pin Responses WebSocket Continuations

**Files:**
- Modify: `internal/handler/responses_ws.go`
- Modify: `internal/handler/responses_ws_test.go`

- [ ] **Step 1: Write failing pinned-route unit tests**

Add tests for a small `responsesWSPinnedRoute` value that copies the selected channel and pool key, and for a session lookup that returns the pinned values only when `previous_response_id` is non-empty and the routing model matches.

```go
func TestResponsesWSSessionReusesPinnedRouteForContinuation(t *testing.T) {
    session := &responsesWSUpstreamSession{}
    ch := &model.Channel{ID: 7, Model: "gpt-upstream"}
    key := &model.PoolKey{ID: 9, Value: "secret"}
    session.pinRoute("gpt-route", ch, key)

    gotCh, gotKey, ok, err := session.continuationRoute("gpt-route", "resp_1")
    if err != nil || !ok || gotCh.ID != 7 || gotKey.ID != 9 {
        t.Fatalf("unexpected pinned route: ch=%#v key=%#v ok=%v err=%v", gotCh, gotKey, ok, err)
    }
}

func TestResponsesWSSessionRejectsModelChangeDuringContinuation(t *testing.T) {
    session := &responsesWSUpstreamSession{}
    session.pinRoute("gpt-route", &model.Channel{ID: 7}, nil)

    _, _, _, err := session.continuationRoute("other-route", "resp_1")
    if err == nil {
        t.Fatal("expected model-change error")
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `go test ./internal/handler -run TestResponsesWSSession -count=1`

Expected: build failure because the route-pinning methods do not exist.

- [ ] **Step 3: Implement pinned route state**

Extend `responsesWSUpstreamSession` with copied route state and these methods:

```go
type responsesWSPinnedRoute struct {
    routingKey string
    channel    model.Channel
    poolKey    *model.PoolKey
}

func (s *responsesWSUpstreamSession) pinRoute(routingKey string, ch *model.Channel, poolKey *model.PoolKey) {
    if s == nil || ch == nil {
        return
    }
    pinned := &responsesWSPinnedRoute{
        routingKey: routingKey,
        channel:    *ch,
    }
    if poolKey != nil {
        copied := *poolKey
        pinned.poolKey = &copied
    }
    s.pinnedRoute = pinned
}

func (s *responsesWSUpstreamSession) continuationRoute(routingKey, previousResponseID string) (*model.Channel, *model.PoolKey, bool, error) {
    if s == nil || s.pinnedRoute == nil || strings.TrimSpace(previousResponseID) == "" {
        return nil, nil, false, nil
    }
    if s.pinnedRoute.routingKey != routingKey {
        return nil, nil, false, fmt.Errorf("previous_response_id 必须继续使用首轮模型")
    }
    ch := s.pinnedRoute.channel
    var poolKey *model.PoolKey
    if s.pinnedRoute.poolKey != nil {
        copied := *s.pinnedRoute.poolKey
        poolKey = &copied
    }
    return &ch, poolKey, true, nil
}
```

The pool key must be copied before storing. `close()` closes transport state but must not discard the pinned route while the client socket remains alive.

- [ ] **Step 4: Use the pinned route in request handling**

Before channel selection, read `previous_response_id` and resolve the optional pinned route:

```go
previousResponseID, _ := responseData["previous_response_id"].(string)
pinnedCh, pinnedPoolKey, reusedRoute, routeErr := upstreamSession.continuationRoute(routingKey, previousResponseID)
if routeErr != nil {
    return routeErr
}
if reusedRoute {
    ch = pinnedCh
    poolKey = pinnedPoolKey
}
```

Move the existing pool-key assignment inside the `!reusedRoute` path so a continuation cannot rotate keys. After `llmSettle` completes successfully, store the route used by the completed turn:

```go
upstreamSession.pinRoute(routingKey, ch, poolKey)
```

A continuation that changes the routing model returns the error above instead of switching upstreams.

- [ ] **Step 5: Run focused handler tests**

Run: `go test ./internal/handler -run 'TestResponsesWS(Session|Prepare|Resolve|Usage)' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit route pinning**

```powershell
git add -- internal/handler/responses_ws.go internal/handler/responses_ws_test.go
git commit -m "fix: pin responses websocket continuations"
```

### Task 3: Nginx WebSocket and Long Idle Timeouts

**Files:**
- Modify: `docker/nginx.conf`
- Modify: `docs/deployment.md`

- [ ] **Step 1: Add conditional Upgrade mapping**

Inside `http {}`, add:

```nginx
map $http_upgrade $fanapi_connection_upgrade {
    default upgrade;
    ''      close;
}
```

- [ ] **Step 2: Add the exact Responses location**

Before the generic direct-API regex location, add `location = /v1/responses` with the existing backend and forwarding headers, plus:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $fanapi_connection_upgrade;
proxy_connect_timeout 10s;
proxy_send_timeout 120s;
proxy_read_timeout 1800s;
send_timeout 1800s;
proxy_buffering off;
proxy_cache off;
proxy_request_buffering off;
```

This exact location handles both POST/SSE and GET/WebSocket. Requests without `Upgrade` use ordinary HTTP proxying.

- [ ] **Step 3: Raise existing API idle limits**

Change both existing API proxy blocks from `proxy_read_timeout 660s` and `send_timeout 660s` to `1800s`. Keep connect and upstream-send timeouts unchanged.

- [ ] **Step 4: Update deployment examples**

Update the corresponding `docs/deployment.md` examples from 660 seconds to 1800 seconds and document that these are idle timeouts, not task-duration limits.

- [ ] **Step 5: Validate Nginx syntax**

Run using the deployment-matching image and mounted configuration:

```powershell
docker run --rm -v "${PWD}/docker/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:stable nginx -t
```

Expected: `syntax is ok` and `test is successful`.

- [ ] **Step 6: Commit Nginx and documentation changes**

```powershell
git add -- docker/nginx.conf docs/deployment.md
git commit -m "fix: extend fanapi streaming proxy timeouts"
```

### Task 4: Full Verification

**Files:**
- Verify all task files only; no new files.

- [ ] **Step 1: Run focused packages**

Run: `go test ./internal/handler ./internal/protocol -count=1`

Expected: PASS.

- [ ] **Step 2: Run the full Go suite**

Run: `go test ./... -count=1`

Expected: PASS.

- [ ] **Step 3: Check formatting and whitespace**

Run `gofmt` on changed Go files, then run: `git diff --check HEAD~3..HEAD`

Expected: no output.

- [ ] **Step 4: Audit final repository state**

Run: `git status --short` and `git log -4 --oneline --decorate`.

Expected: only pre-existing unrelated untracked files remain; the design, plan, and three implementation commits are visible.
