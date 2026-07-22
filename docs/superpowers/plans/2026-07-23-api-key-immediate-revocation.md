# API Key Immediate Revocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deleted or revoked FanAPI API keys fail authentication immediately for new requests.

**Architecture:** Keep the database authoritative and centralize API key mutations in `internal/service/auth.go`. Both mutation paths delete the positive Redis cache entry, while cache-hit authentication verifies that the database still contains an active key by checking the affected row count of the existing `last_used_at` update.

**Tech Stack:** Go, XORM, go-redis, Gin, Go testing package

---

### Task 1: Lock Cache Invalidation Behavior

**Files:**
- Create: `internal/service/auth_api_key_test.go`
- Modify: `internal/service/auth.go:312-346`

- [ ] **Step 1: Write failing cache helper tests**

Add a Redis hook-backed unit test that expects `DeleteAPIKeyCache(ctx, hash)` to issue `DEL apikey2:{hash}`, plus a table test that expects cached authentication to reject zero affected active rows and database errors.

- [ ] **Step 2: Run tests and verify RED**

Run: `go test ./internal/service -run 'Test(DeleteAPIKeyCache|CachedAPIKey)' -count=1`

Expected: compilation fails because the cache helper and cached-row validator do not exist.

- [ ] **Step 3: Add minimal cache and cached-row helpers**

Implement:

```go
func apiKeyCacheKey(keyHash string) string
func DeleteAPIKeyCache(ctx context.Context, keyHash string) error
func cachedAPIKeyActive(affected int64, err error) error
```

Use `cachedAPIKeyActive` after the cache-hit `last_used_at` update, with `key_hash = ? AND is_active = true`. Treat database errors and zero affected rows as authentication failures.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `go test ./internal/service -run 'Test(DeleteAPIKeyCache|CachedAPIKey)' -count=1`

Expected: PASS.

### Task 2: Centralize Delete And Revoke

**Files:**
- Modify: `internal/service/auth.go`
- Modify: `internal/handler/auth_api_key.go:214-229`
- Modify: `internal/handler/admin_user_extra.go:260-269`
- Modify: `internal/service/auth_api_key_test.go`

- [ ] **Step 1: Write failing mutation orchestration tests**

Add table tests for `finishAPIKeyMutation`: a missing row returns `ErrAPIKeyNotFound`, a database error is preserved, a successful mutation invalidates the exact hash, and an invalidation error is returned. Use function arguments as fakes so the test requires neither PostgreSQL nor Redis.

- [ ] **Step 2: Run tests and verify RED**

Run: `go test ./internal/service -run 'TestAPIKeyMutation' -count=1`

Expected: compilation fails because `finishAPIKeyMutation` does not exist.

- [ ] **Step 3: Implement service mutations**

Add `ErrAPIKeyNotFound`, `finishAPIKeyMutation`, `DeleteAPIKey(ctx, userID, keyID)` and `RevokeAPIKey(ctx, keyID)`. Each public function reads the scoped key hash and performs its database mutation, then passes the hash, affected row count and error to `finishAPIKeyMutation`; the helper checks the result and calls the supplied invalidator only after a successful mutation.

- [ ] **Step 4: Route handlers through the service**

Replace direct XORM mutations with the service functions. Preserve user-delete `404`; return `400` for invalid admin IDs, `404` for missing keys, and `500` for database or Redis failures.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `go test ./internal/service ./internal/handler -count=1`

Expected: PASS.

### Task 3: Verify Both Repositories

**Files:**
- Verify only: `D:/gocode/octoapi/internal/authn/apikey.go`
- Verify only: `D:/gocode/octoapi/internal/authn/redis_cache.go`

- [ ] **Step 1: Verify FanAPI**

Run: `go test ./... -count=1`

Run: `git diff --check`

Expected: all tests pass and no whitespace errors.

- [ ] **Step 2: Verify OctoAPI existing protection**

Run from `D:/gocode/octoapi`: `go test ./internal/authn -count=1`

Expected: delete/revoke cache-clearing tests pass; no OctoAPI files change.

- [ ] **Step 3: Inspect final scope**

Run: `git status --short` and `git diff --stat` in both repositories.

Expected: FanAPI contains only the approved backend/test/plan changes plus pre-existing user changes; OctoAPI has no task-related changes.
