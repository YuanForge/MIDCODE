# FanAPI Legacy Feature Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all FanAPI reseller/agent-site code, dead OCPC UI, and obsolete agent-customer-service remnants while preserving invitations, platform support contact, withdrawal review, AI Agent content, and HTTP User-Agent behavior.

**Architecture:** Remove retired features at compile time instead of hiding them behind flags or compatibility handlers. Keep production data safe by removing schema registration and legacy migration inputs without issuing destructive `DROP TABLE` or `DROP COLUMN` statements.

**Tech Stack:** Go 1.26, Gin, XORM, PostgreSQL, React 19, TypeScript, Vite, Playwright

---

### Task 1: Add a failing backend route retirement contract

**Files:**
- Create: `internal/router/legacy_routes_test.go`

- [ ] **Step 1: Write the failing route test**

```go
package router

import (
	"testing"

	"fanapi/internal/config"
	"fanapi/internal/handler"

	"github.com/gin-gonic/gin"
)

func TestRegisterOmitsRetiredResellerRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{}
	engine := gin.New()
	Register(engine, Dependencies{
		Config: cfg,
		Auth: handler.NewAuthHandler(&cfg.Server, nil),
		Vendor: handler.NewVendorHandler(&cfg.Server),
	})

	retired := map[string]struct{}{
		"POST /reseller/auth/login": {},
		"GET /reseller/profile": {},
		"GET /reseller/keys": {},
		"POST /reseller/keys": {},
		"GET /reseller/sites": {},
		"POST /reseller/sites": {},
		"GET /reseller/sites/:id/build-progress": {},
		"GET /reseller/platform/channels": {},
		"GET /admin/resellers": {},
		"POST /admin/resellers": {},
		"PATCH /admin/resellers/:id": {},
		"GET /admin/reseller-sites": {},
		"GET /admin/reseller-site-build-jobs": {},
		"POST /admin/reseller-site-build-jobs/:id/retry": {},
	}

	for _, route := range engine.Routes() {
		key := route.Method + " " + route.Path
		if _, found := retired[key]; found {
			t.Errorf("retired route is still registered: %s", key)
		}
	}
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `go test ./internal/router -run TestRegisterOmitsRetiredResellerRoutes -count=1`

Expected: FAIL listing the currently registered reseller routes.

### Task 2: Remove the reseller backend and schema registration

**Files:**
- Delete: `internal/handler/reseller.go`
- Delete: `internal/middleware/reseller.go`
- Delete: `internal/model/reseller.go`
- Delete: `internal/router/reseller.go`
- Delete: `internal/service/reseller.go`
- Modify: `internal/app/app.go`
- Modify: `internal/config/config.go`
- Modify: `internal/db/db.go`
- Modify: `internal/middleware/rate_limit.go`
- Modify: `internal/router/admin.go`
- Modify: `internal/router/router.go`
- Modify: `internal/router/user.go`
- Test: `internal/router/legacy_routes_test.go`

- [ ] **Step 1: Delete the five reseller-owned backend files**

Remove the files listed above in one patch. Do not replace them with feature flags or compatibility handlers.

- [ ] **Step 2: Remove reseller wiring from the application and router**

Change `Dependencies` to:

```go
type Dependencies struct {
	Config *config.Config
	Auth   *handler.AuthHandler
	Vendor *handler.VendorHandler
}
```

Remove `registerResellerRoutes(r, deps)` from `router.Register`, remove `Reseller: handler.NewResellerHandler(cfg)` from `app.New`, remove the six `/admin/reseller...` registrations, and remove the `/reseller/platform/channels` group.

- [ ] **Step 3: Remove reseller-only schema and configuration**

Delete the four `new(model.Reseller...)` entries from `db.Sync2`. Delete `App`, `ResellerBuilder`, and `PlatformAPI` fields and their now-unused config structs/defaults. Simplify `validateSecrets` so both `jwt_secret` and `api_key_secret` remain required for the only supported application mode.

- [ ] **Step 4: Remove reseller login rate limiting**

Delete only this rule:

```go
{prefix: "/reseller/auth/", limit: 30, window: time.Minute},
```

- [ ] **Step 5: Format and verify GREEN**

Run: `gofmt -w internal/app/app.go internal/config/config.go internal/db/db.go internal/middleware/rate_limit.go internal/router/admin.go internal/router/router.go internal/router/user.go internal/router/legacy_routes_test.go`

Run: `go test ./internal/router ./internal/config ./internal/db -count=1`

Expected: PASS.

- [ ] **Step 6: Commit the backend removal**

```powershell
git add -- internal/app internal/config internal/db internal/handler/reseller.go internal/middleware internal/model/reseller.go internal/router internal/service/reseller.go
git commit -m "refactor: remove legacy reseller backend"
```

### Task 3: Remove old agent customer-service remnants

**Files:**
- Create: `internal/model/user_legacy_test.go`
- Modify: `internal/model/user.go`
- Modify: `internal/handler/auth_session.go`
- Delete: `scripts/migrate_20260416_invite_agent.sql`
- Create: `scripts/migrate_20260416_invites_wechat.sql`

- [ ] **Step 1: Write the failing model contract**

```go
package model

import (
	"reflect"
	"testing"
)

func TestUserOmitsLegacyWechatQR(t *testing.T) {
	if _, found := reflect.TypeOf(User{}).FieldByName("WechatQR"); found {
		t.Fatal("legacy agent customer-service WechatQR field must be removed")
	}
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `go test ./internal/model -run TestUserOmitsLegacyWechatQR -count=1`

Expected: FAIL because `User.WechatQR` still exists.

- [ ] **Step 3: Remove the field and response behavior**

Delete `WechatQR` from `model.User`. In registration, resolve only the inviter ID; do not select `wechat_qr` or return `inviter_wechat_qr`. In login, remove the inviter QR lookup and return only the token/user payload.

- [ ] **Step 4: Replace the mixed legacy SQL with active fields only**

Create `scripts/migrate_20260416_invites_wechat.sql` with:

```sql
-- Invite relationships and WeChat identity fields retained by current FanAPI.
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS inviter_id BIGINT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_openid VARCHAR(64) NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_idx
    ON users (invite_code) WHERE invite_code != '';
CREATE UNIQUE INDEX IF NOT EXISTS users_wechat_openid_idx
    ON users (wechat_openid) WHERE wechat_openid != '';
```

Delete `scripts/migrate_20260416_invite_agent.sql`. Do not add a `DROP COLUMN wechat_qr` migration.

- [ ] **Step 5: Format and verify GREEN**

Run: `gofmt -w internal/model/user.go internal/model/user_legacy_test.go internal/handler/auth_session.go`

Run: `go test ./internal/model ./internal/handler -count=1`

Expected: PASS.

- [ ] **Step 6: Commit the agent-remnant cleanup**

```powershell
git add -- internal/model/user.go internal/model/user_legacy_test.go internal/handler/auth_session.go scripts/migrate_20260416_invite_agent.sql scripts/migrate_20260416_invites_wechat.sql
git commit -m "refactor: remove legacy agent support remnants"
```

### Task 4: Add a failing frontend navigation retirement contract

**Files:**
- Modify: `web/app/tests/e2e/app.spec.ts`

- [ ] **Step 1: Add the failing E2E assertion**

```ts
test('does not expose retired legacy admin navigation', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })

  await page.goto('/admin/dashboard')
  await expect(page.getByRole('link', { name: '代理商管理' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'OCPC 上报' })).toHaveCount(0)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run from `web/app`: `npx playwright test -g "does not expose retired legacy admin navigation" --workers=1`

Expected: FAIL because both navigation links are currently rendered.

### Task 5: Remove reseller and agent frontend surfaces

**Files:**
- Delete: `web/app/src/layouts/ResellerLayout.tsx`
- Delete: `web/app/src/lib/api/reseller.ts`
- Delete: `web/app/src/lib/api/agent.ts`
- Delete: `web/app/src/pages/admin/AdminResellersPage.tsx`
- Delete: `web/app/src/pages/reseller/ResellerDashboardPage.tsx`
- Delete: `web/app/src/pages/reseller/ResellerKeysPage.tsx`
- Delete: `web/app/src/pages/reseller/ResellerLoginPage.tsx`
- Delete: `web/app/src/pages/reseller/ResellerSitesPage.tsx`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/layouts/AdminLayout.tsx`
- Modify: `web/app/src/layouts/ConsoleLayout.tsx`
- Modify: `web/app/src/lib/api/admin.ts`
- Modify: `web/app/src/lib/api/http.ts`
- Modify: `web/app/src/lib/api/upload.ts`
- Modify: `web/app/src/lib/auth/storage.ts`

- [ ] **Step 1: Delete reseller-owned pages, layout, and API clients**

Remove all eight files listed above. The unused `agent.ts` file is deleted rather than redirected.

- [ ] **Step 2: Remove reseller routes and admin menu/API wiring**

Remove reseller lazy imports and route trees from `router.tsx`; remove `/admin/resellers` permission/nav entries; remove `AdminReseller*` types and methods from `admin.ts`.

- [ ] **Step 3: Narrow shared role types**

Change shared role unions to:

```ts
type Role = 'user' | 'admin' | 'vendor'
```

Remove `reseller_token`, reseller login redirects, reseller logout behavior, reseller display fallback, and the reseller upload client.

- [ ] **Step 4: Run the frontend build**

Run from `web/app`: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 5: Commit the reseller frontend removal**

```powershell
git add -- web/app/src
git commit -m "refactor: remove legacy reseller frontend"
```

### Task 6: Remove dead OCPC frontend and tests

**Files:**
- Delete: `web/app/src/pages/admin/AdminOcpcPage.tsx`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/layouts/AdminLayout.tsx`
- Modify: `web/app/src/layouts/ConsoleLayout.tsx`
- Modify: `web/app/src/lib/api/admin.ts`
- Modify: `web/app/src/i18n/resources.ts`
- Modify: `web/app/src/i18n/extra-resources.ts`
- Modify: `web/app/tests/e2e/app.spec.ts`

- [ ] **Step 1: Delete the page and all reachable UI wiring**

Delete the lazy import and `/admin/ocpc` route, permission map entry, nav item, `AdminOcpcPlatform` type, and eight OCPC API methods. Remove `adminOcpc` translations in every language resource.

- [ ] **Step 2: Remove stale OCPC E2E mocks and route coverage**

Delete the `/api/admin/ocpc/platforms` and `/api/admin/ocpc/schedule` mocks. Change the extended-route loop to:

```ts
for (const route of ['/admin/key-pools', '/admin/cards', '/admin/withdraw']) {
```

Keep the new retired-navigation test from Task 4.

- [ ] **Step 3: Verify GREEN**

Run from `web/app`: `npm run build`

Run from `web/app`: `npx playwright test -g "does not expose retired legacy admin navigation|renders extended admin routes" --workers=1`

Expected: PASS.

- [ ] **Step 4: Commit the OCPC removal**

```powershell
git add -- web/app/src web/app/tests/e2e/app.spec.ts
git commit -m "refactor: remove dead OCPC frontend"
```

### Task 7: Remove stale migrations and product documentation

**Files:**
- Delete: `scripts/migrate_20260416_ocpc_conv_types.sql`
- Delete: `docs/agent-site-management-requirements.md`
- Delete: `docs/reseller-site-latest-plan.md`
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Delete dedicated retired-feature artifacts**

Delete the OCPC SQL and the two dedicated agent/reseller site documents. Do not delete historical `docs/superpowers` plans/specs.

- [ ] **Step 2: Correct current documentation**

In `README.md`, replace the invite migration command with `scripts/migrate_20260416_invites_wechat.sql`, delete the OCPC migration command, remove agent portal files from the directory tree, and remove the OCPC settings row. In `docs/deployment.md`, remove `/agent/login` and the nonexistent `[ocpc/...]` log entry. In `DESIGN.md`, remove reseller from supported contexts.

- [ ] **Step 3: Verify current docs contain no live claims for retired features**

Run:

```powershell
rg -n -i "(/agent/login|AdminOcpcPage|/admin/ocpc|reseller_builder|reseller_site|agent-site-management|reseller-site-latest)" README.md DESIGN.md docs/deployment.md internal web/app/src scripts
```

Expected: no matches outside the explicit retirement tests/design/plan.

- [ ] **Step 4: Commit docs and migration cleanup**

```powershell
git add -- README.md DESIGN.md docs/deployment.md docs/agent-site-management-requirements.md docs/reseller-site-latest-plan.md scripts
git commit -m "docs: remove retired FanAPI feature references"
```

### Task 8: Full verification and audit

**Files:**
- Modify only if verification exposes a direct cleanup omission.

- [ ] **Step 1: Run backend verification**

Run: `go test ./... -count=1`

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run from `web/app`: `npm run build`

Run from `web/app`: `npx playwright test --workers=1`

Expected: build and all E2E tests PASS.

- [ ] **Step 3: Audit retired and preserved symbols**

Run:

```powershell
rg -n -i "reseller|ResellerBuilder|PlatformAPI|reseller_site|AdminOcpcPage|/admin/ocpc|inviter_wechat_qr|lib/api/agent" internal web/app/src scripts README.md DESIGN.md docs/deployment.md
rg -n "invite_code|inviter_id|wechat_openid|wechat_cs_url|cs_review|User-Agent" internal web/app/src
```

Expected: the retired scan has no runtime/documentation matches; the preserved scan still finds invitation, platform support, withdrawal review, and User-Agent behavior.

- [ ] **Step 4: Check the final diff and worktree boundaries**

Run:

```powershell
git diff --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors; only scoped cleanup changes plus the pre-existing untracked `.superpowers/`; no unrelated files staged or modified.

- [ ] **Step 5: Record verification fixes if needed**

If direct omissions were fixed during verification, stage only those files and commit:

```powershell
git commit -m "test: verify legacy feature cleanup"
```
