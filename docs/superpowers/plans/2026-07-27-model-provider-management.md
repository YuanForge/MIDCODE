# Model Provider Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class model-provider administration so one API key can safely bind ordered model groups across multiple providers while disabled providers stop participating in new requests immediately.

**Architecture:** `model_providers` becomes the authoritative provider catalog. `model_groups` and `channels` reference it by ID, runtime candidates join the active provider row, and compatibility names are derived from that join. The UI reads the same catalog for administration and dropdowns; API-key replacement preserves bindings owned by disabled providers.

**Tech Stack:** Go, Gin, XORM, PostgreSQL SQL migrations, React, TypeScript, shadcn/ui, Node test runner, Playwright.

---

## File Map

- Create `internal/model/model_provider.go`: persistent provider entity.
- Create `internal/service/model_provider.go`: normalization, CRUD, reference counts, conflict errors.
- Create `internal/handler/admin_model_provider.go`: admin HTTP contract and status mapping.
- Create `internal/service/model_provider_test.go`: validation and disabled-binding unit tests.
- Modify `internal/model/model_group.go`, `internal/model/channel.go`: authoritative provider ID plus compatibility response fields.
- Modify `internal/service/model_group.go`, `internal/service/channel.go`, `internal/service/model_group_routing.go`, `internal/service/api_key_groups.go`: provider lookup, consistency, routing and replacement rules.
- Modify `internal/handler/admin_model_group.go`, `internal/handler/channel.go`, `internal/router/admin.go`, `internal/db/db.go`: request validation, routes and schema registration.
- Create `scripts/migrate_20260727_model_providers.sql`: explicit PostgreSQL create/backfill/audit/constraint migration.
- Modify `web/app/src/lib/api/admin.ts`, `web/app/src/lib/api/user.ts`: provider-aware API types and methods.
- Create `web/app/src/pages/admin/AdminModelProvidersPage.tsx`: provider management table and dialogs.
- Modify `web/app/src/pages/admin/AdminModelGroupsPage.tsx`, `web/app/src/pages/admin/AdminChannelsPage.tsx`: provider dropdowns.
- Modify `web/app/src/components/shared/ModelGroupSelector.tsx`, `web/app/src/pages/user/UserKeysPage.tsx`, `web/app/src/pages/admin/AdminApiKeysPage.tsx`: provider-ID grouping, provider ordering, disabled diagnostics.
- Modify `web/app/src/app/router.tsx`, `web/app/src/layouts/ConsoleLayout.tsx`, `web/app/src/layouts/AdminLayout.tsx`: navigation and permission mapping.
- Create `web/app/tests/unit/model-provider-contract.test.mjs` and `web/app/tests/e2e/model-provider-management.spec.ts`: frontend contracts and workflow coverage.

### Task 1: Provider Domain And Admin API

**Files:**
- Create: `internal/model/model_provider.go`
- Create: `internal/service/model_provider.go`
- Create: `internal/service/model_provider_test.go`
- Create: `internal/handler/admin_model_provider.go`
- Modify: `internal/db/db.go`
- Modify: `internal/router/admin.go`

- [ ] **Step 1: Write failing provider validation tests**

Add table tests for `normalizeModelProviderCode`, `normalizeModelProviderName`, `validateModelProviderInput`, and `providerCodeCanChange`. Assert lowercase storage, `[a-z0-9][a-z0-9_-]*`, trimmed non-empty names, negative sort rejection, unchanged referenced codes allowed, and changed referenced codes rejected.

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/service -run 'TestNormalizeModelProvider|TestValidateModelProvider|TestProviderCodeCanChange' -count=1`

Expected: compile failure because the new helpers do not exist.

- [ ] **Step 3: Implement the provider model and service**

Use this entity shape:

```go
type ModelProvider struct {
    ID int64 `xorm:"pk autoincr 'id'" json:"id"`
    Code string `xorm:"notnull 'code'" json:"code"`
    Name string `xorm:"notnull 'name'" json:"name"`
    IsActive bool `xorm:"notnull default(true) 'is_active'" json:"is_active"`
    SortOrder int `xorm:"notnull default(0) 'sort_order'" json:"sort_order"`
    CreatedAt time.Time `xorm:"created 'created_at'" json:"created_at"`
    UpdatedAt time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}
```

Expose `ListModelProviders`, `GetModelProvider`, `CreateModelProvider`, `UpdateModelProvider`, `ToggleModelProvider`, and `DeleteModelProvider`. List rows include `group_count` and `channel_count`, ordered by `sort_order, id`. Use sentinel errors `ErrModelProviderNotFound`, `ErrModelProviderConflict`, and `ErrModelProviderReferenced` so handlers can map 404/409 without parsing strings. Let PostgreSQL unique/FK constraints remain the concurrency backstop.

- [ ] **Step 4: Add admin handlers and routes**

Register exactly:

```go
admin.GET("/model-providers", handler.ListModelProviders)
admin.POST("/model-providers", handler.CreateModelProvider)
admin.PUT("/model-providers/:id", handler.UpdateModelProvider)
admin.PATCH("/model-providers/:id/toggle", handler.ToggleModelProvider)
admin.DELETE("/model-providers/:id", handler.DeleteModelProvider)
```

Require `code`, `name`, and non-negative `sort_order`; create defaults `is_active=true`. Return 400 validation, 404 missing, 409 case-insensitive duplicate/reference/code-lock, otherwise 500.

- [ ] **Step 5: Verify GREEN and commit**

Run: `gofmt -w internal/model/model_provider.go internal/service/model_provider.go internal/service/model_provider_test.go internal/handler/admin_model_provider.go internal/db/db.go internal/router/admin.go`

Run: `go test ./internal/service ./internal/handler ./internal/router -count=1`

Commit: `feat: add model provider administration`

### Task 2: Make Provider IDs Authoritative For Groups And Channels

**Files:**
- Modify: `internal/model/model_group.go`
- Modify: `internal/model/channel.go`
- Modify: `internal/service/model_group.go`
- Modify: `internal/service/channel.go`
- Modify: `internal/handler/admin_model_group.go`
- Modify: `internal/handler/channel.go`
- Modify: `internal/service/model_group_test.go`

- [ ] **Step 1: Write failing ID-consistency tests**

Replace string-normalization tests with tests for `validateModelGroupInput` requiring `ModelProviderID > 0`, `validateModelGroupChannelProvider` comparing IDs, and `providerSelectionAllowed(currentID, requestedProvider)` allowing unchanged inactive historical records but rejecting new or switched inactive assignments.

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/service -run 'TestValidateModelGroupInput|TestValidateModelGroupChannelProvider|TestProviderSelectionAllowed' -count=1`

Expected: failures because model structs and validation still use provider strings.

- [ ] **Step 3: Add authoritative fields and joined summaries**

Add `ModelProviderID int64` with `json:"model_provider_id"` to both entities. Keep `ModelProvider string` as compatibility output/column during this release, but do not use it for validation or routing. Group/channel list reads must join `model_providers`, selecting provider name, active state and sort order into response view structs.

- [ ] **Step 4: Make writes transactional**

For create/update, load the requested provider in the same session and require it active unless the provider ID is unchanged on an existing historical record. Group/channel provider changes must query existing model bindings and reject mismatched provider IDs before updating. Update `model_provider_id` and compatibility `model_provider` together from the loaded provider name.

- [ ] **Step 5: Verify GREEN and commit**

Run: `gofmt -w internal/model/model_group.go internal/model/channel.go internal/service/model_group.go internal/service/channel.go internal/handler/admin_model_group.go internal/handler/channel.go internal/service/model_group_test.go`

Run: `go test ./internal/service ./internal/handler -count=1`

Commit: `feat: assign groups and channels to providers`

### Task 3: Enforce Provider State In Every Runtime Route

**Files:**
- Modify: `internal/service/model_group_routing.go`
- Modify: `internal/service/channel.go`
- Modify: `internal/service/model_group_routing_test.go`

- [ ] **Step 1: Write failing route-contract tests**

Change route row/provider validation to use `ModelProviderID`, and add source contract tests that assert the candidate queries in `model_group_routing.go` and `channel.go` join `model_providers mp` and contain `mp.is_active = true`. Cover `IsChannelAuthorizedForAPIKey` and `GetChannel` explicitly.

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/service -run 'TestBuildModelGroupRoutes|TestModelGroupRouteQueryRequiresActiveProvider|TestExplicitChannelRequiresActiveProvider' -count=1`

Expected: new source-contract tests fail before active-provider joins exist.

- [ ] **Step 3: Implement the shared active-provider predicate**

Join `model_providers mp ON mp.id = mg.model_provider_id` in the single candidate query and filter `mp.is_active = true`. Ensure normal HTTP/SSE, tasks, Responses/Reatime WebSocket and explicit channel authorization all reach a query that also joins the channel provider and requires it active. Preserve group priority, channel health filtering and existing all-unhealthy fallback.

- [ ] **Step 4: Verify GREEN and commit**

Run: `gofmt -w internal/service/model_group_routing.go internal/service/*.go internal/handler/*.go`

Run: `go test ./internal/service ./internal/handler -count=1`

Commit: `feat: stop routes for disabled model providers`

### Task 4: Preserve Disabled-Provider API-Key Bindings

**Files:**
- Modify: `internal/service/api_key_groups.go`
- Modify: `internal/handler/auth_api_key.go`
- Modify: `internal/service/model_provider_test.go`

- [ ] **Step 1: Write failing replacement tests**

Test a pure helper that compares current ordered bindings with requested IDs and provider active state. Disabled-provider subsequences must match exactly; addition, deletion or reordering returns an error, while active-provider bindings can change and cross-provider interleaving remains accepted.

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/service -run 'TestValidateDisabledProviderBindings' -count=1`

Expected: compile failure because the comparison helper does not exist.

- [ ] **Step 3: Enforce the rule before replacement**

In the replacement transaction, load current bindings plus provider state, load requested groups plus provider state, reject inactive new choices, and call the comparison helper before deleting rows. Only then replace bindings and normalize priority. API-key creation accepts active groups only. `ListAvailableAPIKeyModelGroups` returns active choices plus inactive groups already bound to the edited key through the binding endpoint.

- [ ] **Step 4: Verify GREEN and commit**

Run: `gofmt -w internal/service/api_key_groups.go internal/service/model_provider_test.go`

Run: `go test ./internal/service ./internal/handler -count=1`

Commit: `feat: preserve disabled provider key bindings`

### Task 5: Frontend API And Provider Management Page

**Files:**
- Modify: `web/app/src/lib/api/admin.ts`
- Create: `web/app/src/pages/admin/AdminModelProvidersPage.tsx`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/layouts/ConsoleLayout.tsx`
- Modify: `web/app/src/layouts/AdminLayout.tsx`
- Create: `web/app/tests/unit/model-provider-contract.test.mjs`

- [ ] **Step 1: Write failing frontend contract test**

Assert `AdminModelProvider` exposes ID/code/name/active/order/counts, CRUD methods use the five approved endpoints, the route `/admin/model-providers` is lazy-loaded, navigation label is `模型企业`, and the page contains create/edit/toggle/delete commands plus affected group/channel counts.

- [ ] **Step 2: Verify RED**

Run: `node --test web/app/tests/unit/model-provider-contract.test.mjs`

Expected: FAIL because types, page and route are absent.

- [ ] **Step 3: Implement the compact management UI**

Use the existing `PageHeader`, table, `Dialog`, `AlertDialog`, `Input`, `Switch` and icon-button patterns. Fetch once on mount and refresh after mutations. Disable delete when either reference count is non-zero and show the reason. The disable confirmation must show both counts and state that new requests stop immediately. Use a numeric input for `sort_order`; do not add drag-and-drop.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test web/app/tests/unit/model-provider-contract.test.mjs`

Run from `web/app`: `npx eslint src/lib/api/admin.ts src/pages/admin/AdminModelProvidersPage.tsx src/app/router.tsx src/layouts/ConsoleLayout.tsx src/layouts/AdminLayout.tsx`

Commit: `feat: add model provider management page`

### Task 6: Replace Provider Free Text With Dropdowns

**Files:**
- Modify: `web/app/src/pages/admin/AdminModelGroupsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminChannelsPage.tsx`
- Modify: `web/app/tests/unit/model-group-batch.test.mjs`

- [ ] **Step 1: Write failing dropdown contracts**

Assert both pages call `adminApi.listModelProviders(true)`, submit `model_provider_id`, and use a `Select` instead of provider `Input`/`datalist`. Assert inactive current providers remain visible during edit but cannot be newly selected.

- [ ] **Step 2: Verify RED**

Run: `node --test web/app/tests/unit/model-group-batch.test.mjs web/app/tests/unit/model-provider-contract.test.mjs`

Expected: FAIL while the forms still submit `model_provider` text.

- [ ] **Step 3: Implement shared catalog behavior without a new abstraction**

Each existing page loads providers alongside its existing data using `Promise.all`. New forms list active providers only. Edit forms include the record's inactive provider as a disabled diagnostic option, preserve it for unrelated edits, and only submit an active changed ID. Render provider status badges from joined response fields.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test web/app/tests/unit/model-group-batch.test.mjs web/app/tests/unit/model-provider-contract.test.mjs`

Run from `web/app`: `npx eslint src/pages/admin/AdminModelGroupsPage.tsx src/pages/admin/AdminChannelsPage.tsx`

Commit: `feat: select providers for groups and channels`

### Task 7: Provider-Aware API-Key Selector

**Files:**
- Modify: `web/app/src/lib/api/user.ts`
- Modify: `web/app/src/components/shared/ModelGroupSelector.tsx`
- Modify: `web/app/src/pages/user/UserKeysPage.tsx`
- Modify: `web/app/src/pages/admin/AdminApiKeysPage.tsx`
- Modify: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`

- [ ] **Step 1: Extend failing E2E fixtures and assertions**

Fixtures must include `model_provider_id`, `model_provider_active`, and `model_provider_sort_order`. Assert tabs follow provider order rather than first appearance, selected disabled bindings are read-only and still present in the PUT payload, and active providers keep provider-local move ordering.

- [ ] **Step 2: Verify RED**

Run from `web/app`: `npx playwright test tests/e2e/api-key-model-group-provider.spec.ts --workers=1`

Expected: FAIL because grouping is still keyed and ordered by provider-name first appearance and inactive bindings are editable.

- [ ] **Step 3: Implement ID-based grouping and read-only diagnostics**

Group by provider ID, sort providers by `model_provider_sort_order, model_provider_id`, and keep the compatibility name only as a label. Disable checkbox/move controls for inactive-provider groups. Preserve their selected IDs untouched when active selections change. Avoid derived-state effects; compute providers with `useMemo` and use functional updates where callbacks depend on prior state.

- [ ] **Step 4: Verify GREEN and commit**

Run from `web/app`: `npx playwright test tests/e2e/api-key-model-group-provider.spec.ts --workers=1`

Run from `web/app`: `npx eslint src/lib/api/user.ts src/components/shared/ModelGroupSelector.tsx src/pages/user/UserKeysPage.tsx src/pages/admin/AdminApiKeysPage.tsx`

Commit: `feat: group api key routes by provider catalog`

### Task 8: Migration, Full Regression And Visual Acceptance

**Files:**
- Create: `scripts/migrate_20260727_model_providers.sql`
- Create: `web/app/tests/e2e/model-provider-management.spec.ts`
- Modify: any task files needed by failures only

- [ ] **Step 1: Write migration and UI contract tests first**

The migration contract test must assert creation of `model_providers`, case-insensitive unique indexes, nullable ID columns before backfill, deterministic canonical provider rows, conflict audit queries, zero-audit gate, NOT NULL, foreign keys with deletion restriction, and no removal of compatibility string columns. E2E must cover create, edit, disable confirmation counts, disabled status, protected delete and mobile fit.

- [ ] **Step 2: Verify RED**

Run: `node --test web/app/tests/unit/model-provider-contract.test.mjs`

Run from `web/app`: `npx playwright test tests/e2e/model-provider-management.spec.ts --workers=1`

Expected: FAIL before the SQL contract and completed page workflow exist.

- [ ] **Step 3: Implement the explicit migration**

Use PostgreSQL DDL and CTEs only. Abort on blank providers, normalized name/code collisions, unresolved IDs, group/channel provider mismatches, or one routing model assigned across providers. Add unique indexes on `LOWER(code)` and `LOWER(BTRIM(name))`, then NOT NULL and FK constraints only after all audits pass. Do not execute this SQL against production.

- [ ] **Step 4: Run fresh full verification**

Run: `go test ./... -count=1`

Run from `web/app`: `node --test tests/unit/*.test.mjs`

Run from `web/app`: `npm run build`

Run scoped ESLint for every modified TS/TSX file. Run full lint separately and report pre-existing baseline rather than changing unrelated files.

Run from `web/app`: `npx playwright test tests/e2e/model-group-toggle.spec.ts tests/e2e/api-key-model-group-provider.spec.ts tests/e2e/model-provider-management.spec.ts --workers=1`

Start or reuse a preview server, then capture desktop and 390px screenshots. Verify no overflow, overlap, hidden actions, console errors, or failed requests. This proves local UI behavior only; it does not prove the migration, release or deployment.

- [ ] **Step 5: Audit and commit**

Run: `git diff --check`

Run: `git status --short`

Stage only the migration, tests and feature files; leave `.superpowers/` untouched.

Commit: `test: verify model provider management`

## Completion Checklist

- [ ] Every production behavior was preceded by a failing test or contract check.
- [ ] Provider ID, not compatibility strings, is authoritative in writes and routing.
- [ ] Disabled providers are excluded from all new request paths and re-enable restores relationships.
- [ ] Disabled API-key bindings survive replacement unchanged.
- [ ] Case-insensitive uniqueness and deletion protection exist at service and database layers.
- [ ] Admin groups/channels use provider dropdowns and API-key UI is provider-ID ordered.
- [ ] Full Go, frontend unit, build, scoped lint and relevant E2E commands have fresh evidence.
- [ ] No production SQL, push, tag or deployment was performed.
