# MidCode Octo UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate MidCode's public, authentication, user, and administrator frontend surfaces to the approved OctoAPI-derived design system, while preserving current business behavior and adding accurate per-model and per-channel Token statistics.

**Architecture:** Keep the existing React/Vite/Tailwind/shadcn application and introduce a small set of semantic foundations, shared page fragments, and shared data-visualization components. Migrate pages in batches without changing their API behavior. Add two dedicated read-only Go endpoints that aggregate existing `llm_logs.usage` data in PostgreSQL: user results group by exact model name, while administrator results are always filtered by exact `channel_id`.

**Tech Stack:** Go, Gin, Xorm, PostgreSQL JSONB, React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router, Playwright

---

## Execution Safety

The working tree already contains user-owned changes, including overlapping files:

- `web/app/src/lib/api/user.ts`
- `web/app/src/pages/admin/AdminChannelsPage.tsx`
- `web/app/tests/e2e/app.spec.ts`
- multiple Go billing, protocol, and handler files

Do not reset, discard, or replace these changes. Before each task, run `git diff --` followed by the exact paths listed in that task's **Files** section, then merge the task into the current content. Stage only the files named by that task. If execution uses a worktree, it must start from the current working tree state; otherwise execute in the current workspace with conflict-aware edits.

## File Structure

New focused files:

- `web/app/src/components/shared/PageContainer.tsx`: consistent page width and vertical rhythm.
- `web/app/src/components/shared/PageSection.tsx`: titled surface wrapper.
- `web/app/src/components/shared/FilterBar.tsx`: consistent filter/action layout.
- `web/app/src/components/shared/TokenUsageBarChart.tsx`: model/channel Token stacked bars.
- `web/app/src/lib/token-usage.ts`: Token display formatting and chart normalization.
- `web/app/src/pages/admin/AdminChannelTokenStatsPage.tsx`: dedicated read-only channel analysis route.
- `internal/handler/token_stats.go`: Token normalization, query parsing, user aggregation, and channel aggregation handlers.
- `internal/handler/token_stats_test.go`: protocol normalization and parameter tests.
- `web/app/tests/e2e/ui-migration.spec.ts`: public/auth/shell visual-contract checks.
- `web/app/tests/e2e/token-stats.spec.ts`: strict per-model and per-channel behavior checks.

Existing files remain responsible for their current business behavior. Do not move API calls or form logic merely to satisfy visual refactoring.

---

## Phase A: Shared System, Public Pages, and User Pages

### Task 1: Add failing visual-contract tests for MidCode shells

**Files:**
- Create: `web/app/tests/e2e/ui-migration.spec.ts`
- Modify: `web/app/tests/e2e/app.spec.ts`

- [ ] **Step 1: Inspect current overlapping test changes**

Run:

```powershell
git diff -- web/app/tests/e2e/app.spec.ts
```

Expected: existing Fast-ratio and route coverage changes are visible and remain untouched.

- [ ] **Step 2: Create the failing shell contract test**

Create `web/app/tests/e2e/ui-migration.spec.ts` with shared public settings mocks and these assertions:

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }),
    }),
  )
})

test('public and auth surfaces use MidCode branding', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('MidCode')
  await expect(page.getByText('FanAPI Gateway')).toHaveCount(0)

  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('MidCode').first()).toBeVisible()
})

test('user console exposes the shared shell', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/user/balance', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"balance_credits":0}' }),
  )
  await page.route('**/api/user/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto('/dashboard')
  await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
  await expect(page.locator('[data-slot="page-container"]')).toBeVisible()
})
```

- [ ] **Step 3: Run the focused test to verify failure**

Run:

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/ui-migration.spec.ts
```

Expected: FAIL because the shell and page-container data slots do not exist and the homepage still contains a visible FanAPI label.

- [ ] **Step 4: Commit the failing tests**

```powershell
git add web/app/tests/e2e/ui-migration.spec.ts
git commit -m "test: define MidCode UI migration contract"
```

### Task 2: Encode the approved semantic design tokens

**Files:**
- Modify: `DESIGN.md`
- Modify: `web/app/src/index.css`
- Modify: `web/app/src/components/ui/button.tsx`
- Modify: `web/app/src/components/ui/card.tsx`
- Modify: `web/app/src/components/ui/input.tsx`
- Modify: `web/app/src/components/ui/table.tsx`

- [ ] **Step 1: Replace light and dark semantic values in `index.css`**

Use exact approved values for the light theme and keep their semantic counterparts in dark mode:

```css
:root {
  --background: #f5f6f9;
  --foreground: #1b2130;
  --card: #ffffff;
  --card-foreground: #1b2130;
  --popover: #ffffff;
  --popover-foreground: #1b2130;
  --primary: #4a5be7;
  --primary-foreground: #ffffff;
  --secondary: #f1f3f7;
  --secondary-foreground: #1b2130;
  --muted: #f1f3f7;
  --muted-foreground: #5c6472;
  --accent: #eceefd;
  --accent-foreground: #3b49c7;
  --border: #e5e8ec;
  --input: #e5e8ec;
  --ring: #7582f0;
  --radius: 0.75rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #1b2130;
  --sidebar-primary: #4a5be7;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #eceefd;
  --sidebar-accent-foreground: #3b49c7;
  --sidebar-border: #e5e8ec;
}

.dark {
  --background: #0e1013;
  --foreground: #e7e9ee;
  --card: #16181d;
  --card-foreground: #e7e9ee;
  --popover: #1c1f26;
  --popover-foreground: #e7e9ee;
  --primary: #7c86ff;
  --primary-foreground: #0e1013;
  --secondary: #1c1f26;
  --secondary-foreground: #e7e9ee;
  --muted: #1c1f26;
  --muted-foreground: #99a0ad;
  --accent: #262a31;
  --accent-foreground: #e7e9ee;
  --border: #262a31;
  --input: #262a31;
  --ring: #7c86ff;
  --sidebar: #16181d;
  --sidebar-foreground: #e7e9ee;
  --sidebar-primary: #7c86ff;
  --sidebar-primary-foreground: #0e1013;
  --sidebar-accent: #1c1f26;
  --sidebar-accent-foreground: #e7e9ee;
  --sidebar-border: #262a31;
}
```

Remove the decorative radial body background. Set the Chinese-first font stack while retaining Geist for numeric and Latin fallback:

```css
@theme inline {
  --font-sans: "PingFang SC", "Microsoft YaHei UI", "Noto Sans SC", "Geist Variable", sans-serif;
}

body {
  @apply bg-background text-foreground;
  font-size: 15px;
}
```

- [ ] **Step 2: Update the repository design contract**

Change `DESIGN.md` so MidCode is the visible product name and the approved OctoAPI-derived tokens, public/console density split, shared-component hierarchy, and no-fake-feature rule are the current frontend contract. Retain backend and role facts that remain accurate.

- [ ] **Step 3: Normalize primitive dimensions**

Update Button/Input default heights to 40 px, cards to `rounded-xl border-border`, and table headers/rows to the approved 44/48 px density. Preserve all existing variants and exports.

- [ ] **Step 4: Build the application**

Run:

```powershell
cd web/app
pnpm build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 5: Commit tokens and primitives**

```powershell
git add DESIGN.md web/app/src/index.css web/app/src/components/ui/button.tsx web/app/src/components/ui/card.tsx web/app/src/components/ui/input.tsx web/app/src/components/ui/table.tsx
git commit -m "feat: encode MidCode design foundations"
```

### Task 3: Add shared page fragments

**Files:**
- Create: `web/app/src/components/shared/PageContainer.tsx`
- Create: `web/app/src/components/shared/PageSection.tsx`
- Create: `web/app/src/components/shared/FilterBar.tsx`
- Modify: `web/app/src/components/shared/PageHeader.tsx`
- Modify: `web/app/src/components/shared/EmptyState.tsx`
- Modify: `web/app/src/components/shared/TableSkeleton.tsx`
- Modify: `web/app/src/components/shared/TablePagination.tsx`

- [ ] **Step 1: Create `PageContainer`**

```tsx
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="page-container"
      className={cn('mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 md:px-6 md:py-6', className)}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Create `PageSection`**

```tsx
import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PageSection({ title, description, action, children }: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create `FilterBar`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function FilterBar({ filters, actions, className }: {
  filters: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{filters}</div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
```

- [ ] **Step 4: Align header, empty, loading, and pagination fragments**

Give `PageHeader` a 28 px page title, 14 px description, restrained eyebrow, and stable action alignment. Make `EmptyState`, `TableSkeleton`, and `TablePagination` use the same border, spacing, and minimum-height rules.

- [ ] **Step 5: Build and commit**

```powershell
cd web/app
pnpm build
cd ../..
git add web/app/src/components/shared
git commit -m "feat: add MidCode page composition primitives"
```

### Task 4: Rebuild the shared shells and visible brand

**Files:**
- Modify: `web/app/index.html`
- Modify: `web/app/src/components/shared/AppLogo.tsx`
- Modify: `web/app/src/layouts/AuthLayout.tsx`
- Modify: `web/app/src/layouts/ConsoleLayout.tsx`
- Modify: `web/app/src/layouts/UserLayout.tsx`
- Modify: `web/app/src/layouts/AdminLayout.tsx`

- [ ] **Step 1: Inspect overlapping layout behavior**

Run:

```powershell
git diff -- web/app/src/layouts web/app/src/components/shared/AppLogo.tsx web/app/index.html
```

Preserve dynamic site settings, RBAC navigation filtering, role switching, header/footer HTML, mobile sidebar behavior, and balance loading.

- [ ] **Step 2: Mark the application shell and adopt the approved geometry**

In `ConsoleLayout`, add `data-slot="app-shell"` to `SidebarProvider`, keep the 220-240 px sidebar, use a 58 px top bar, and render normal pages through `PageContainer`. Full-bleed generation pages keep their existing exception.

The central structure becomes:

```tsx
<SidebarProvider data-slot="app-shell">
  <Sidebar>{/* existing permission-aware navigation */}</Sidebar>
  <SidebarInset>
    <header className="sticky top-0 z-20 flex h-[58px] items-center justify-between border-b bg-card px-4 md:px-6">
      {/* existing controls */}
    </header>
    <main className="min-w-0 flex-1">
      {isFullBleedPage ? <Outlet /> : <PageContainer><Outlet /></PageContainer>}
    </main>
  </SidebarInset>
</SidebarProvider>
```

- [ ] **Step 3: Preserve MidCode dynamic branding**

Keep the fallback `MidCode` in `index.html`, `AppLogo`, and `useSiteSettings`. Do not rename `__FANAPI_ENV__` or internal storage keys.

- [ ] **Step 4: Run the shell contract test**

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/ui-migration.spec.ts
```

Expected: shell data-slot assertions pass; the homepage brand assertion may still fail until Task 5.

- [ ] **Step 5: Commit shared shells**

```powershell
git add web/app/index.html web/app/src/components/shared/AppLogo.tsx web/app/src/layouts/AuthLayout.tsx web/app/src/layouts/ConsoleLayout.tsx web/app/src/layouts/UserLayout.tsx web/app/src/layouts/AdminLayout.tsx
git commit -m "feat: rebuild MidCode application shells"
```

### Task 5: Migrate public and authentication pages

**Files:**
- Modify: `web/app/src/pages/public/PublicHomePage.tsx`
- Modify: `web/app/src/pages/public/UserLoginPage.tsx`
- Modify: `web/app/src/pages/public/RegisterPage.tsx`
- Modify: `web/app/src/pages/public/ForgotPasswordPage.tsx`
- Modify: `web/app/src/pages/public/AppErrorPage.tsx`
- Modify: `web/app/src/pages/public/NotFoundPage.tsx`
- Modify: `web/app/src/pages/admin/AdminLoginPage.tsx`

- [ ] **Step 1: Replace the visible FanAPI homepage label**

Remove `FanAPI Gateway` and other visible FanAPI copy. Use the dynamic `siteName` and neutral descriptions such as `AI Gateway` where a product descriptor is required.

- [ ] **Step 2: Apply one authentication composition**

All user/admin auth pages use the same shell:

```tsx
<div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_480px]">
  <section className="hidden border-r bg-muted/45 p-10 lg:flex lg:flex-col lg:justify-between">
    {/* MidCode brand, concise capability copy, trust points */}
  </section>
  <main className="flex items-center justify-center p-6 md:p-10">
    <Card className="w-full max-w-md">
      {/* existing form fields, validation, submit behavior */}
    </Card>
  </main>
</div>
```

Do not change form payloads, redirects, remembered-login behavior, or error messages.

- [ ] **Step 3: Run public/auth tests**

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/ui-migration.spec.ts tests/e2e/app.spec.ts --grep "login|MidCode branding"
```

Expected: all selected tests pass.

- [ ] **Step 4: Commit public/auth migration**

```powershell
git add web/app/src/pages/public web/app/src/pages/admin/AdminLoginPage.tsx
git commit -m "feat: migrate MidCode public and auth pages"
```

### Task 6: Migrate user pages to shared templates

**Files:**
- Modify: `web/app/src/pages/user/UserDashboardPage.tsx`
- Modify: `web/app/src/pages/user/UserModelsPage.tsx`
- Modify: `web/app/src/pages/user/UserKeysPage.tsx`
- Modify: `web/app/src/pages/user/UserLogsPage.tsx`
- Modify: `web/app/src/pages/user/UserTasksPage.tsx`
- Modify: `web/app/src/pages/user/UserBillingPage.tsx`
- Modify: `web/app/src/pages/user/UserExchangePage.tsx`
- Modify: `web/app/src/pages/user/UserInvitePage.tsx`
- Modify: `web/app/src/pages/user/UserProfilePage.tsx`
- Modify: `web/app/src/pages/user/UserDocsPage.tsx`
- Modify: `web/app/src/pages/user/UserTutorialPage.tsx`
- Modify: `web/app/src/pages/user/UserPlaygroundPage.tsx`
- Modify: `web/app/src/pages/user/UserCreationPage.tsx`
- Modify: `web/app/src/pages/user/UserImageGenPage.tsx`
- Modify: `web/app/src/pages/user/UserVideoGenPage.tsx`
- Modify: `web/app/src/pages/user/UserMusicGenPage.tsx`

- [ ] **Step 1: Preserve current overlapping user-log changes**

```powershell
git diff -- web/app/src/pages/user/UserLogsPage.tsx
```

Keep all existing log fields, payload visibility rules, and detail behavior.

- [ ] **Step 2: Convert overview and detail pages**

Use `PageHeader` plus `PageSection`; remove ad hoc colored icon cards and decorative gradients. Keep all existing API calls and state transitions.

- [ ] **Step 3: Convert list pages**

Models, keys, logs, and tasks use this stable sequence:

```tsx
<>
  <PageHeader title="..." description="..." actions={...} />
  <FilterBar filters={...} actions={...} />
  <Card className="overflow-hidden">
    {/* existing table, skeleton, empty, pagination, and detail actions */}
  </Card>
</>
```

- [ ] **Step 4: Convert settings and account pages**

Billing, exchange, invite, and profile use `PageSection` blocks. Financial confirmations remain explicit and QR/contact images retain their current behavior.

- [ ] **Step 5: Convert generation and docs pages**

Preserve full-bleed generation workspaces and all existing hooks. Apply tokens to panels, tabs, prompts, result/history regions, and responsive drawers without moving business logic.

- [ ] **Step 6: Run user route coverage**

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/app.spec.ts --grep "user"
```

Expected: authenticated user route tests pass.

- [ ] **Step 7: Commit user migration**

```powershell
git add web/app/src/pages/user
git commit -m "feat: migrate MidCode user pages"
```

---

## Phase B: Administrator Pages

### Task 7: Migrate administrator page patterns

**Files:**
- Modify: `web/app/src/pages/admin/AdminDashboardPage.tsx`
- Modify: `web/app/src/pages/admin/AdminChannelsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminUsersPage.tsx`
- Modify: `web/app/src/pages/admin/AdminBillingPage.tsx`
- Modify: `web/app/src/pages/admin/AdminCardsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminKeyPoolsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminTasksPage.tsx`
- Modify: `web/app/src/pages/admin/AdminLogsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminSettingsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminVendorsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminResellersPage.tsx`
- Modify: `web/app/src/pages/admin/AdminAlertsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminApiKeysPage.tsx`
- Modify: `web/app/src/pages/admin/AdminAuditPage.tsx`
- Modify: `web/app/src/pages/admin/AdminCouponsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminExportsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminInspirationPage.tsx`
- Modify: `web/app/src/pages/admin/AdminNotificationsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminOcpcPage.tsx`
- Modify: `web/app/src/pages/admin/AdminPaymentsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminRolesPage.tsx`
- Modify: `web/app/src/pages/admin/AdminUpstreamPage.tsx`
- Modify: `web/app/src/pages/admin/AdminVipGroupsPage.tsx`
- Modify: `web/app/src/pages/admin/AdminWithdrawPage.tsx`

- [ ] **Step 1: Inspect current channel-editor changes**

```powershell
git diff -- web/app/src/pages/admin/AdminChannelsPage.tsx
```

Preserve Fast-ratio fields, cost synchronization, filtering, health state, logs, batch actions, and all dialog behavior.

- [ ] **Step 2: Convert dashboard and list-management pages**

Use shared page headers, filter bars, table density, loading/empty/error states, numeric alignment, and pagination. Keep permissions and action visibility unchanged.

- [ ] **Step 3: Convert forms and configuration pages**

Use `PageSection`, consistent form labels, 40 px controls, and stable destructive confirmations. Do not change payload shapes.

- [ ] **Step 4: Keep channel Token statistics out of edit state**

At this task, reserve an action location beside Edit/Logs but do not add the action until Task 10. The edit dialog remains configuration-only.

- [ ] **Step 5: Run administrator route coverage**

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/app.spec.ts --grep "admin"
```

Expected: administrator login, dashboard, route, and Fast-ratio tests pass.

- [ ] **Step 6: Commit administrator migration**

```powershell
git add web/app/src/pages/admin
git commit -m "feat: migrate MidCode administrator pages"
```

---

## Phase C: Accurate Token Statistics

### Task 8: Add tested protocol-aware Token normalization

**Files:**
- Create: `internal/handler/token_stats.go`
- Create: `internal/handler/token_stats_test.go`

- [ ] **Step 1: Write failing normalization tests**

Create table-driven tests:

```go
func TestNormalizeTokenUsage(t *testing.T) {
	tests := []struct {
		name, protocol string
		prompt, output, cacheRead, cacheCreate int64
		want tokenUsageTotals
	}{
		{
			name: "openai cache is included in prompt", protocol: "openai",
			prompt: 100, output: 20, cacheRead: 40,
			want: tokenUsageTotals{NonCachedInput: 60, CacheRead: 40, Output: 20, Total: 120},
		},
		{
			name: "claude cache is separate", protocol: "claude",
			prompt: 60, output: 20, cacheRead: 40, cacheCreate: 10,
			want: tokenUsageTotals{NonCachedInput: 60, CacheRead: 40, CacheCreation: 10, Output: 20, Total: 130},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeTokenUsage(tt.protocol, tt.prompt, tt.output, tt.cacheRead, tt.cacheCreate)
			if got != tt.want { t.Fatalf("got %+v want %+v", got, tt.want) }
		})
	}
}
```

- [ ] **Step 2: Run the test to verify failure**

```powershell
go test ./internal/handler -run TestNormalizeTokenUsage -count=1
```

Expected: FAIL because `tokenUsageTotals` and `normalizeTokenUsage` do not exist.

- [ ] **Step 3: Implement the minimal normalization function**

```go
type tokenUsageTotals struct {
	NonCachedInput int64 `json:"non_cached_input_tokens"`
	CacheRead      int64 `json:"cache_read_tokens"`
	CacheCreation  int64 `json:"cache_creation_tokens"`
	Output         int64 `json:"output_tokens"`
	Total          int64 `json:"total_tokens"`
}

func normalizeTokenUsage(protocol string, prompt, output, cacheRead, cacheCreation int64) tokenUsageTotals {
	nonCached := prompt
	if protocol != "claude" {
		nonCached -= cacheRead
		if nonCached < 0 { nonCached = 0 }
	}
	total := nonCached + cacheRead + cacheCreation + output
	return tokenUsageTotals{
		NonCachedInput: nonCached,
		CacheRead: cacheRead,
		CacheCreation: cacheCreation,
		Output: output,
		Total: total,
	}
}
```

- [ ] **Step 4: Add range parsing tests**

Test that missing dates resolve to the current Asia/Shanghai day, invalid ranges return an error, and `end_at <= start_at` is rejected.

- [ ] **Step 5: Run tests and commit**

```powershell
go test ./internal/handler -run "TestNormalizeTokenUsage|TestParseTokenStatsRange" -count=1
git add internal/handler/token_stats.go internal/handler/token_stats_test.go
git commit -m "feat: normalize cross-protocol Token usage"
```

### Task 9: Add the per-model user Token endpoint and page

**Files:**
- Modify: `internal/handler/token_stats.go`
- Modify: `internal/handler/token_stats_test.go`
- Modify: `internal/router/user.go`
- Modify: `web/app/src/lib/api/user.ts`
- Create: `web/app/src/lib/token-usage.ts`
- Create: `web/app/src/components/shared/TokenUsageBarChart.tsx`
- Modify: `web/app/src/pages/user/UserStatsPage.tsx`
- Create: `web/app/tests/e2e/token-stats.spec.ts`

- [ ] **Step 1: Add a failing route contract test**

In `token-stats.spec.ts`, mock `/api/user/stats/tokens**` with three distinct models and assert all three labels appear, `Other` does not appear, and no cross-model total card exists.

```ts
await expect(page.getByText('gpt-5.6-sol')).toBeVisible()
await expect(page.getByText('gpt-5.6-terra')).toBeVisible()
await expect(page.getByText('claude-4.5')).toBeVisible()
await expect(page.getByText('Other')).toHaveCount(0)
await expect(page.getByText('累计 Token')).toHaveCount(0)
```

- [ ] **Step 2: Run the browser test to verify failure**

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/token-stats.spec.ts --grep "per model"
```

Expected: FAIL because the endpoint client and new page do not exist.

- [ ] **Step 3: Implement `GET /user/stats/tokens`**

Register:

```go
user.GET("/stats/tokens", handler.GetUserTokenStats)
```

The SQL must filter `ll.user_id = ?`, `ll.status = 'ok'`, and the selected time range; join `channels c ON c.id = ll.channel_id`; extract numeric JSONB fields; normalize by `LOWER(COALESCE(c.protocol,'openai'))`; group by exact `ll.model`; order by normalized total descending; and paginate without introducing an `Other` row.

Return:

```json
{
  "items": [{
    "model": "gpt-5.6-sol",
    "non_cached_input_tokens": 3220000,
    "cache_read_tokens": 1090000,
    "cache_creation_tokens": 0,
    "output_tokens": 1080000,
    "total_tokens": 5390000
  }],
  "page": 1,
  "page_size": 20,
  "total": 1,
  "start_at": "...",
  "end_at": "..."
}
```

- [ ] **Step 4: Add frontend types and client**

Add `TokenUsageRow`, `TokenStatsResponse`, and:

```ts
getTokenStats: (params: { start_at: string; end_at: string; model?: string; page: number; page_size: number }) =>
  http.get<TokenStatsResponse>('/user/stats/tokens', { params }),
```

Merge this into the existing modified `user.ts`; do not replace unrelated changes.

- [ ] **Step 5: Create the shared stacked bar chart**

`TokenUsageBarChart` accepts exact rows and renders one scrollable bar per row with four segments: non-cached input, cache read, cache creation, and output. It never groups rows.

- [ ] **Step 6: Replace `/stats` with chart plus table only**

Remove `StatCard`, daily credit charts, and cross-model totals. Render `DateRangeFilter`, model search, `TokenUsageBarChart`, and a paginated table with the five approved numeric columns.

- [ ] **Step 7: Run backend and frontend tests**

```powershell
go test ./internal/handler -run "TestNormalizeTokenUsage|TestParseTokenStatsRange" -count=1
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/token-stats.spec.ts --grep "per model"
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit user Token statistics**

```powershell
git add internal/handler/token_stats.go internal/handler/token_stats_test.go internal/router/user.go web/app/src/lib/api/user.ts web/app/src/lib/token-usage.ts web/app/src/components/shared/TokenUsageBarChart.tsx web/app/src/pages/user/UserStatsPage.tsx web/app/tests/e2e/token-stats.spec.ts
git commit -m "feat: add per-model user Token statistics"
```

### Task 10: Add per-channel administrator Token analysis

**Files:**
- Modify: `internal/handler/token_stats.go`
- Modify: `internal/handler/token_stats_test.go`
- Modify: `internal/router/admin.go`
- Modify: `web/app/src/lib/api/admin.ts`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/pages/admin/AdminChannelsPage.tsx`
- Create: `web/app/src/pages/admin/AdminChannelTokenStatsPage.tsx`
- Modify: `web/app/tests/e2e/token-stats.spec.ts`

- [ ] **Step 1: Add a failing channel-isolation browser test**

Mock two channel rows with the same model name, click channel `97`'s `Token 统计` button, and assert the request targets `/api/admin/channels/97/token-stats` and the page identifies channel `#97`, not `#94`.

```ts
await page.getByRole('row', { name: /97/ }).getByRole('button', { name: 'Token 统计' }).click()
await expect(page).toHaveURL(/\/admin\/channels\/97\/token-stats/)
await expect(page.getByText('渠道 #97')).toBeVisible()
await expect(page.getByText('渠道 #94')).toHaveCount(0)
```

- [ ] **Step 2: Run the test to verify failure**

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/token-stats.spec.ts --grep "channel isolation"
```

Expected: FAIL because the action, route, and endpoint client do not exist.

- [ ] **Step 3: Implement `GET /admin/channels/:id/token-stats`**

Register:

```go
admin.GET("/channels/:id/token-stats", handler.GetAdminChannelTokenStats)
```

Validate that the channel exists, then query `llm_logs` with `ll.channel_id = ?`, `ll.status = 'ok'`, and the selected time range. Normalize using that channel's protocol. Return exact channel metadata, totals, and hour/day buckets:

```json
{
  "channel": { "id": 97, "name": "...", "model": "gpt-5.6-sol", "protocol": "responses" },
  "totals": {
    "non_cached_input_tokens": 13410000,
    "cache_read_tokens": 5010000,
    "cache_creation_tokens": 0,
    "output_tokens": 4810000,
    "total_tokens": 23230000
  },
  "points": [{ "label": "10:00", "total_tokens": 1200000 }],
  "start_at": "...",
  "end_at": "..."
}
```

Do not group or join results by model name.

- [ ] **Step 4: Add frontend types, client, and route**

Add:

```ts
getChannelTokenStats: (id: number, params: { start_at: string; end_at: string; bucket: 'hour' | 'day' }) =>
  http.get<AdminChannelTokenStatsResponse>(`/admin/channels/${id}/token-stats`, { params }),
```

Add lazy route `channels/:id/token-stats` to `router.tsx`.

- [ ] **Step 5: Add the separate channel-table action**

In the existing action cell, add:

```tsx
<Button size="sm" variant="outline" asChild>
  <Link to={`/admin/channels/${row.id}/token-stats`}>Token 统计</Link>
</Button>
```

Do not add Token state, tabs, or API calls to the channel edit dialog.

- [ ] **Step 6: Build the dedicated read-only page**

The page contains a return link preserving the channel-list query string, selected-channel identity, today/7-day/30-day/custom filters, four Token components, a trend chart, loading/empty/error states, and no edit controls.

- [ ] **Step 7: Run isolation tests**

```powershell
go test ./internal/handler -run "TestNormalizeTokenUsage|TestParseTokenStatsRange" -count=1
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/token-stats.spec.ts --grep "channel isolation"
```

Expected: all selected tests pass and the mocked request contains channel ID `97`.

- [ ] **Step 8: Commit administrator Token statistics**

```powershell
git add internal/handler/token_stats.go internal/handler/token_stats_test.go internal/router/admin.go web/app/src/lib/api/admin.ts web/app/src/app/router.tsx web/app/src/pages/admin/AdminChannelsPage.tsx web/app/src/pages/admin/AdminChannelTokenStatsPage.tsx web/app/tests/e2e/token-stats.spec.ts
git commit -m "feat: add per-channel Token analysis"
```

### Task 11: Complete visible MidCode brand cleanup

**Files:**
- Modify: `web/app/src/pages/public/PublicHomePage.tsx`
- Modify: `web/app/src/pages/admin/AdminSettingsPage.tsx`
- Modify: `README.md`

- [ ] **Step 1: Audit visible names**

Run:

```powershell
rg -n "FanAPI|fanapi" web/app/src web/app/index.html web/app/public/env.example.js README.md
```

Classify each result as visible copy or compatibility identifier. Keep `__FANAPI_ENV__`, existing local-storage keys, Go module names, environment variables, and card prefixes.

- [ ] **Step 2: Replace visible copy only**

Examples, headings, and product instructions shown to users become MidCode. Do not rename API fields, environment variables, storage keys, or documented compatibility identifiers. Inspect the existing `README.md` diff first and merge text changes without discarding user edits.

- [ ] **Step 3: Run the brand contract**

```powershell
cd web/app
pnpm build
pnpm exec playwright test tests/e2e/ui-migration.spec.ts --grep "MidCode branding"
```

Expected: PASS.

- [ ] **Step 4: Commit brand cleanup**

```powershell
git add web/app/src/pages/public/PublicHomePage.tsx web/app/src/pages/admin/AdminSettingsPage.tsx
git commit -m "chore: align visible branding with MidCode"
```

Because `README.md` was already modified before this plan, do not stage it in this commit. Leave the merged README brand changes in the working tree and report them separately unless the pre-existing README work has been committed by its owner before execution reaches this task.

### Task 12: Run full regression and browser QA

**Files:**
- Modify only files required to fix verified regressions

- [ ] **Step 1: Run Go tests**

```powershell
go test ./...
```

Expected: PASS.

- [ ] **Step 2: Run frontend build and full E2E suite**

```powershell
cd web/app
pnpm build
pnpm exec playwright test
```

Expected: PASS.

- [ ] **Step 3: Run visible-brand audit again**

```powershell
rg -n "FanAPI Gateway|例如：FanAPI|© .*FanAPI" web/app/src web/app/index.html
```

Expected: no matches.

- [ ] **Step 4: Validate rendered flows with the Browser plugin**

The flow under test is: homepage/authentication -> user console and `/stats` -> administrator channels -> channel `Token 统计` -> dedicated channel analysis page.

Verify at desktop and mobile widths:

- intended URL and title
- meaningful DOM content
- no framework overlay
- no relevant console warnings/errors
- sidebar and mobile navigation interaction
- user model chart/table contains distinct models and no `Other`
- two same-model channels open different ID-scoped statistics URLs
- dark mode remains readable
- screenshots match the approved MidCode concepts

- [ ] **Step 5: Fix only observed defects and rerun the failing check**

For each defect, record reference evidence, rendered evidence, the fix, and the repeated check result.

- [ ] **Step 6: Commit QA fixes through the owning task**

If verification finds a defect, return to the task that owns the affected file, add a failing focused check there, apply the fix, rerun that task's verification command, and use that task's explicit staging list. Do not create a catch-all commit and do not stage unrelated working-tree changes.

## Completion Criteria

- Public, authentication, user, and administrator surfaces use one approved MidCode design system.
- Vendor and reseller surfaces remain functional and are not redesigned in this scope.
- Existing backend behavior remains unchanged except for the two read-only Token endpoints.
- User Token statistics contain only a stacked bar chart and table, with one row per exact model.
- Administrator Token statistics are opened from a dedicated channel-row action and are filtered by exact `channel_id`.
- OpenAI/Responses/Gemini cache reads are not double-counted.
- Claude cache reads and cache creation are included in normalized totals.
- User-visible FanAPI branding is removed while compatibility identifiers remain intact.
- Go tests, frontend build, Playwright tests, and browser QA all pass.
