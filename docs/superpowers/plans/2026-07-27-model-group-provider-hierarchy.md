# Model Group Provider Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-provider constraint to every model group, let one API Key select independently ordered groups across multiple providers, and replace per-group route lookup with one indexed join.

**Architecture:** Store the canonical model company in `model_groups.model_provider`, validate it against each channel's existing `EffectiveModelProvider`, and preserve the flat `group_ids` API while grouping and reordering those IDs by provider in the UI. Runtime selection continues to accept only API Key plus exact `routing_model`; one join returns authorized candidates in priority order before the existing health filter and retry logic.

**Tech Stack:** Go 1.x, Gin, Xorm, PostgreSQL migrations, React 19, TypeScript, shadcn/Radix tabs, Tailwind CSS, Node test runner, Playwright.

---

## File Map

- `internal/model/model_group.go`: persist and serialize the provider on each group.
- `scripts/migrate_20260727_model_group_providers.sql`: idempotent column creation, deterministic backfill, audit gates, and final non-empty constraint.
- `internal/service/model_group.go`: provider normalization, group/channel/provider validation, and cross-provider model-name protection.
- `internal/service/model_group_test.go`: pure provider and validation regression tests.
- `internal/handler/admin_model_group.go`: accept `model_provider` in group create/update payloads.
- `internal/service/model_group_routing.go`: single-query candidate and explicit-channel authorization lookups.
- `internal/service/model_group_routing_test.go`: candidate ordering/exclusion regression checks.
- `web/app/src/lib/api/admin.ts`: admin group provider contract.
- `web/app/src/lib/api/user.ts`: user-visible group provider contract.
- `web/app/src/pages/admin/AdminModelGroupsPage.tsx`: provider input, provider badges, and provider-compatible channel choices.
- `web/app/src/components/shared/ModelGroupSelector.tsx`: provider tabs, selection, and provider-local ordering shared by API Key create/edit dialogs.
- `web/app/src/pages/user/UserKeysPage.tsx`: replace duplicate flat selectors with the shared provider selector.
- `web/app/tests/unit/model-group-batch.test.mjs`: admin provider-field source contract.
- `web/app/tests/e2e/model-group-toggle.spec.ts`: keep existing admin group behavior valid with provider data.
- `web/app/tests/e2e/api-key-model-group-provider.spec.ts`: multi-provider selection, provider-local order, payload, and responsive behavior.

### Task 1: Persist And Enforce One Provider Per Model Group

**Files:**
- Modify: `internal/model/model_group.go`
- Modify: `internal/service/model_group.go`
- Modify: `internal/service/model_group_test.go`
- Modify: `internal/handler/admin_model_group.go`
- Create: `scripts/migrate_20260727_model_group_providers.sql`

- [ ] **Step 1: Add failing provider normalization and compatibility tests**

Add tests covering canonical common names, whitespace normalization, required providers, matching channel providers, and mismatches:

```go
func TestNormalizeModelProvider(t *testing.T) {
    cases := map[string]string{
        " openai ": "OpenAI",
        "ANTHROPIC": "Anthropic",
        "Acme   Models": "Acme Models",
    }
    for input, want := range cases {
        if got := normalizeModelProvider(input); got != want {
            t.Fatalf("normalizeModelProvider(%q) = %q, want %q", input, got, want)
        }
    }
}

func TestValidateModelGroupProvider(t *testing.T) {
    group := model.ModelGroup{Code: "gpt", Name: "GPT", ModelProvider: "OpenAI"}
    if err := validateModelGroupInput(&group); err != nil {
        t.Fatalf("valid group: %v", err)
    }
    if err := validateModelGroupChannelProvider(group, model.Channel{Model: "gpt-4.1", ModelProvider: "OpenAI"}); err != nil {
        t.Fatalf("matching provider: %v", err)
    }
    if err := validateModelGroupChannelProvider(group, model.Channel{Model: "claude-sonnet-4", ModelProvider: "Anthropic"}); err == nil {
        t.Fatal("expected mismatched provider to fail")
    }
}
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `go test ./internal/service -run 'TestNormalizeModelProvider|TestValidateModelGroupProvider' -count=1`

Expected: FAIL because `ModelProvider`, `normalizeModelProvider`, and `validateModelGroupChannelProvider` do not exist.

- [ ] **Step 3: Add the model field and minimal normalization helpers**

Add to `model.ModelGroup`:

```go
ModelProvider string `xorm:"notnull default('') 'model_provider'" json:"model_provider"`
```

Implement a pure normalizer using `strings.Fields`, a small common-name map, and case-insensitive comparison:

```go
func normalizeModelProvider(value string) string {
    value = strings.Join(strings.Fields(value), " ")
    switch strings.ToLower(value) {
    case "openai":
        return "OpenAI"
    case "anthropic":
        return "Anthropic"
    case "google":
        return "Google"
    case "deepseek":
        return "DeepSeek"
    case "alibaba":
        return "Alibaba"
    default:
        return value
    }
}
```

Require a non-empty normalized provider in `validateModelGroupInput`, normalize it in create/update, and validate `strings.EqualFold(group.ModelProvider, EffectiveModelProvider(channel))` before binding.

- [ ] **Step 4: Add cross-provider model and provider-change guards**

Before inserting a binding, query `model_group_models JOIN model_groups` for the same `routing_model` under a different case-insensitive provider and reject it. Before updating a group's provider, load all bound channels and reject the update when any effective provider differs. Keep errors concrete, for example:

```go
return fmt.Errorf("routing model %q already belongs to model provider %q", routingModel, existingProvider)
```

Use a transaction for group-provider updates and binding validation/insertion so validation failures do not partially update metadata.

- [ ] **Step 5: Extend the admin payload**

Add `ModelProvider string 'json:"model_provider"'` to `modelGroupPayload` and copy it into both create and update `model.ModelGroup` values.

- [ ] **Step 6: Add the idempotent migration and audit gate**

Create SQL that:

```sql
ALTER TABLE model_groups
    ADD COLUMN IF NOT EXISTS model_provider VARCHAR(128) NOT NULL DEFAULT '';

WITH provider_candidates AS (
    SELECT mgm.group_id, MIN(BTRIM(c.model_provider)) AS model_provider
    FROM model_group_models mgm
    JOIN channels c ON c.id = mgm.channel_id
    GROUP BY mgm.group_id
    HAVING COUNT(*) = COUNT(NULLIF(BTRIM(c.model_provider), ''))
       AND COUNT(DISTINCT LOWER(BTRIM(c.model_provider))) = 1
)
UPDATE model_groups mg
SET model_provider = pc.model_provider
FROM provider_candidates pc
WHERE mg.id = pc.group_id
  AND BTRIM(mg.model_provider) = '';
```

Follow the backfill with read-only audit queries for blank group providers, blank bound-channel providers, mixed-provider groups, and cross-provider duplicate `routing_model` values. A final `DO $$` block raises an exception if any count is non-zero; only then add/validate a `CHECK (BTRIM(model_provider) <> '')` constraint. Do not update a migration ledger when the audit gate fails.

- [ ] **Step 7: Run focused and package tests**

Run: `gofmt -w internal/model/model_group.go internal/service/model_group.go internal/service/model_group_test.go internal/handler/admin_model_group.go`

Run: `go test ./internal/service ./internal/handler -run 'ModelGroup|ModelProvider' -count=1`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```powershell
git add -- internal/model/model_group.go internal/service/model_group.go internal/service/model_group_test.go internal/handler/admin_model_group.go scripts/migrate_20260727_model_group_providers.sql
git commit -m "feat: enforce model group providers"
```

### Task 2: Replace Per-Group Routing With One Authorized Candidate Query

**Files:**
- Modify: `internal/service/model_group_routing.go`
- Modify: `internal/service/model_group_routing_test.go`

- [ ] **Step 1: Add failing row-conversion and provider metadata tests**

Extend `ModelGroupRoute` with `ModelProvider` and add a pure conversion helper test proving provider metadata, priority order, and excluded channels survive the query-row conversion:

```go
func TestBuildModelGroupRoutesKeepsProviderOrderAndExclusions(t *testing.T) {
    rows := []modelGroupRouteRow{
        {RouteGroupID: 20, RoutePriority: 2, RouteBindingID: 2, ModelProvider: "OpenAI", Channel: model.Channel{ID: 200}},
        {RouteGroupID: 10, RoutePriority: 1, RouteBindingID: 1, ModelProvider: "OpenAI", Channel: model.Channel{ID: 100}},
    }
    got := buildModelGroupRoutes(rows, []int64{100})
    if len(got) != 1 || got[0].GroupID != 20 || got[0].ModelProvider != "OpenAI" {
        t.Fatalf("routes = %+v", got)
    }
}
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `go test ./internal/service -run 'TestBuildModelGroupRoutes' -count=1`

Expected: FAIL because the row type/helper/provider field do not exist.

- [ ] **Step 3: Implement the single Xorm join**

Define a joined row with non-conflicting aliases:

```go
type modelGroupRouteRow struct {
    RouteGroupID   int64  `xorm:"route_group_id"`
    RoutePriority  int    `xorm:"route_priority"`
    RouteBindingID int64  `xorm:"route_binding_id"`
    ModelProvider  string `xorm:"model_provider"`
    model.Channel  `xorm:"extends"`
}
```

Replace `LoadAPIKeyModelGroupBindings` plus the per-binding group/model/channel lookups with one `Table("api_key_model_groups").Alias("akmg")` query joining `model_groups mg`, `model_group_models mgm`, and `channels c`. Filter `akmg.api_key_id`, exact `mgm.routing_model`, active group/channel, optional protocol, and excluded channel IDs; order by `akmg.priority, akmg.id`.

Preserve `ErrAPIKeyModelGroupsNotConfigured` by checking whether the Key has any bindings before candidate lookup. A bound Key with no matching route still returns `no model %q is available in API key groups`.

- [ ] **Step 4: Replace explicit channel authorization with an existence join**

Implement one `Exist` query joining the same three tables and filtering API Key, exact routing model, channel ID, and active group/channel. Do not fall back to global channel selection on query errors.

- [ ] **Step 5: Preserve health filtering and retry order**

Keep `SelectHealthyModelGroupRoutes` unchanged except for consuming joined routes. Verify it still returns healthy authorized routes when any exist and all authorized routes when every candidate is unhealthy.

- [ ] **Step 6: Run focused and full service tests**

Run: `gofmt -w internal/service/model_group_routing.go internal/service/model_group_routing_test.go`

Run: `go test ./internal/service -run 'ModelGroupRoutes|ModelGroupProvider' -count=1`

Run: `go test ./internal/service -count=1`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- internal/service/model_group_routing.go internal/service/model_group_routing_test.go
git commit -m "perf: query model group routes once"
```

### Task 3: Add Provider Configuration To The Admin Model Group UI

**Files:**
- Modify: `web/app/src/lib/api/admin.ts`
- Modify: `web/app/src/pages/admin/AdminModelGroupsPage.tsx`
- Modify: `web/app/tests/unit/model-group-batch.test.mjs`
- Modify: `web/app/tests/e2e/model-group-toggle.spec.ts`

- [ ] **Step 1: Add failing source-contract assertions**

Require the admin type and form to carry `model_provider`, the input to offer native suggestions, and the table to show a provider badge:

```js
assert.match(page, /model_provider/)
assert.match(page, /<datalist id="model-provider-options">/)
assert.match(page, /模型企业/)
assert.match(page, /channel\.model_provider/)
```

- [ ] **Step 2: Run the unit test and confirm RED**

Run from `web/app`: `node --test tests/unit/model-group-batch.test.mjs`

Expected: FAIL because the group form does not contain provider controls.

- [ ] **Step 3: Extend API types and form state**

Add `model_provider?: string` to `AdminModelGroup`, and make `GroupForm.model_provider` required in local state. Preserve it in `edit(group)` and include it in existing create/update calls.

- [ ] **Step 4: Add the provider input and compatible model filtering**

Use a native input with a datalist rather than adding a dependency:

```tsx
<Input
  list="model-provider-options"
  value={form.model_provider}
  onChange={(event) => setForm((current) => ({ ...current, model_provider: event.target.value }))}
  placeholder="OpenAI / Anthropic / 自定义企业"
/>
<datalist id="model-provider-options">
  {['OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'Alibaba'].map((provider) => <option key={provider} value={provider} />)}
</datalist>
```

Filter selectable channels to those whose explicit `channel.model_provider` matches the selected group provider case-insensitively; keep already-bound channels visible so invalid historical data can be diagnosed. Show an inline hint when no provider is selected.

- [ ] **Step 5: Add provider badges and update E2E fixtures**

Add an “企业” column/badge to the group table and include `model_provider: 'OpenAI'` in existing mocked groups. Verify disable/re-enable and edit-state synchronization still pass.

- [ ] **Step 6: Run admin UI checks**

Run from `web/app`:

```powershell
node --test tests/unit/model-group-batch.test.mjs
npx eslint src/pages/admin/AdminModelGroupsPage.tsx src/lib/api/admin.ts tests/e2e/model-group-toggle.spec.ts
npm run build
$env:PLAYWRIGHT_PREVIEW_PORT='4304'; npx playwright test tests/e2e/model-group-toggle.spec.ts
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- web/app/src/lib/api/admin.ts web/app/src/pages/admin/AdminModelGroupsPage.tsx web/app/tests/unit/model-group-batch.test.mjs web/app/tests/e2e/model-group-toggle.spec.ts
git commit -m "feat: manage model group providers"
```

### Task 4: Build The Multi-Provider API Key Group Selector

**Files:**
- Modify: `web/app/src/lib/api/user.ts`
- Create: `web/app/src/components/shared/ModelGroupSelector.tsx`
- Modify: `web/app/src/pages/user/UserKeysPage.tsx`
- Create: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`

- [ ] **Step 1: Write a failing browser test for cross-provider selection**

Mock `/api/user/model-groups` with two OpenAI and two Anthropic groups, open the API Key creation dialog, and assert:

```ts
await expect(page.getByRole('tab', { name: /OpenAI/ })).toBeVisible()
await expect(page.getByRole('tab', { name: /Anthropic/ })).toBeVisible()
await page.getByRole('tab', { name: /OpenAI/ }).click()
await page.getByLabel('gpt-k12').check()
await page.getByLabel('gpt-plus').check()
await page.getByRole('tab', { name: /Anthropic/ }).click()
await page.getByLabel('claude').check()
await page.getByRole('button', { name: '创建', exact: true }).click()
await expect.poll(() => createPayload?.group_ids).toEqual([1, 2, 3])
```

Also reopen the edit dialog with bindings from both providers, reorder only OpenAI, save, and assert the Anthropic relative order is unchanged.

- [ ] **Step 2: Build and run the new test to confirm RED**

Run from `web/app`:

```powershell
npm run build
$env:PLAYWRIGHT_PREVIEW_PORT='4305'; npx playwright test tests/e2e/api-key-model-group-provider.spec.ts
```

Expected: FAIL because provider tabs and shared selector do not exist.

- [ ] **Step 3: Extend the user API contract**

Add `model_provider?: string` to `ApiKeyModelGroup`. Existing binding responses automatically expose it through `binding.group`.

- [ ] **Step 4: Implement the shared provider selector**

Create a controlled component:

```tsx
type ModelGroupSelectorProps = {
  groups: ApiKeyModelGroup[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}
```

The component must export exactly the `ModelGroupSelectorProps` contract above and a `ModelGroupSelector` React component; the implementation follows the concrete state and merge rules below.

Implementation rules:

- Normalize blank providers to a visible “未配置企业” diagnostic tab, but available production groups should be nonblank after migration.
- Derive provider order from first appearance in `groups`; do not maintain a second provider database.
- Use shadcn `Tabs`, a horizontally scrollable `TabsList`, checkboxes, and lucide `ArrowUpIcon`/`ArrowDownIcon` icon buttons with tooltips.
- On toggle, add/remove only that group ID.
- On move, extract selected IDs for the active provider, reorder that slice, and merge it back while preserving every other provider's relative order.
- Display provider-local ordinal numbers and “优先使用/故障回退 N” labels.
- Keep stable dimensions and a single-column layout at 390px.

- [ ] **Step 5: Replace both selectors in `UserKeysPage`**

Use the shared component in create and edit dialogs. Remove duplicate `moveGroup`, drag state, drag handlers, and raw arrow text buttons. Increase dialog width responsively using the existing side-aware dialog classes only as needed, with a constrained max height and internal scrolling so footer actions remain visible.

Add provider badges to the API Key table without nesting cards.

- [ ] **Step 6: Run focused frontend verification**

Run from `web/app`:

```powershell
npx eslint src/components/shared/ModelGroupSelector.tsx src/pages/user/UserKeysPage.tsx src/lib/api/user.ts tests/e2e/api-key-model-group-provider.spec.ts
npm run build
$env:PLAYWRIGHT_PREVIEW_PORT='4305'; npx playwright test tests/e2e/api-key-model-group-provider.spec.ts
```

Expected: PASS, including create payload, edit payload, provider-local ordering, and mobile overflow assertions.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- web/app/src/lib/api/user.ts web/app/src/components/shared/ModelGroupSelector.tsx web/app/src/pages/user/UserKeysPage.tsx web/app/tests/e2e/api-key-model-group-provider.spec.ts
git commit -m "feat: group api key routes by provider"
```

### Task 5: Full Regression, Visual QA, And Release Readiness Report

**Files:**
- Modify only files required by failures caused by Tasks 1-4.

- [ ] **Step 1: Run backend verification**

Run from repository root:

```powershell
go test ./internal/service ./internal/handler -count=1
go test ./... -count=1
```

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run from `web/app`:

```powershell
node --test tests/unit/*.test.mjs
npm run build
npx eslint src/pages/admin/AdminModelGroupsPage.tsx src/components/shared/ModelGroupSelector.tsx src/pages/user/UserKeysPage.tsx src/lib/api/admin.ts src/lib/api/user.ts tests/e2e/model-group-toggle.spec.ts tests/e2e/api-key-model-group-provider.spec.ts
$env:PLAYWRIGHT_PREVIEW_PORT='4306'; npx playwright test tests/e2e/model-group-toggle.spec.ts tests/e2e/api-key-model-group-provider.spec.ts
```

Expected: PASS. Run `npm run lint` separately and report any pre-existing repository baseline rather than editing unrelated files.

- [ ] **Step 3: Perform browser visual QA**

Start the Vite development server on an unused port and use the in-app browser to inspect:

- Admin group list/provider form at 1440x900.
- API Key creation dialog with OpenAI and Anthropic selections at 1440x900.
- The same dialog at 390x844.
- Enterprise tab horizontal scrolling, long group names, selected counts, icon tooltips, fixed footer, and no overlapping text.

Save screenshots under the existing test output or a temporary verification directory; do not commit generated screenshots unless explicitly requested.

- [ ] **Step 4: Check migration and diff safety**

Run:

```powershell
git diff --check
git status --short
```

Review the migration as SQL only. Do not connect the current local configuration to PostgreSQL because it may target production. Report that migration acceptance remains unverified until the audited SQL is run against an isolated or explicitly approved target database.

- [ ] **Step 5: Commit verification-only fixes if needed**

Stage only files changed to address failures from this feature:

```powershell
git add -- internal/model/model_group.go internal/service/model_group.go internal/service/model_group_test.go internal/handler/admin_model_group.go scripts/migrate_20260727_model_group_providers.sql internal/service/model_group_routing.go internal/service/model_group_routing_test.go web/app/src/lib/api/admin.ts web/app/src/lib/api/user.ts web/app/src/pages/admin/AdminModelGroupsPage.tsx web/app/src/components/shared/ModelGroupSelector.tsx web/app/src/pages/user/UserKeysPage.tsx web/app/tests/unit/model-group-batch.test.mjs web/app/tests/e2e/model-group-toggle.spec.ts web/app/tests/e2e/api-key-model-group-provider.spec.ts
git commit -m "test: verify model provider group routing"
```

If no verification fixes are needed, do not create an empty commit.

- [ ] **Step 6: Report the boundary precisely**

Report local tests/build/E2E/browser evidence separately from database migration, repository publication, and deployment. Do not create a release tag, push, or deploy unless the user separately authorizes those actions.
