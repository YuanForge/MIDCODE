# Model Group Hidden Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every saved model-group binding visible in the editor so the selected count always corresponds to rendered checked rows.

**Architecture:** Keep `selectedModelChannels` as the authoritative editing state. Extend the existing `modelOptions` memo to union current channel routing models with saved binding routing models, using the embedded binding channel when a saved name no longer matches the channel's current name. Preserve all backend contracts and require an explicit administrator action to migrate or remove a historical binding.

**Tech Stack:** React 19, TypeScript, Vite, Playwright, Node test runner

---

### Task 1: Reproduce The Hidden Historical Binding

**Files:**
- Create: `web/app/tests/e2e/model-group-hidden-binding.spec.ts`

- [ ] **Step 1: Write the failing end-to-end test**

Create `web/app/tests/e2e/model-group-hidden-binding.spec.ts` with this fixture. It supplies one saved `claude-sonnet-5-cc` binding whose channel now advertises `claude-sonnet-5`.

```typescript
import { expect, test } from '@playwright/test'

test('shows saved bindings whose routing model differs from the current channel model', async ({ page }) => {
  const channel = {
    id: 155,
    name: 'https://zzshu.cc/claude-sonnet-5-max3',
    model: 'claude-sonnet-5',
    display_name: 'claude-sonnet-5',
    model_provider_id: 1,
    is_active: true,
  }

  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })

  await page.route('**/api/public/settings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }),
  }))
  await page.route('**/api/admin/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 1, username: 'admin', role: 'admin' }),
  }))
  await page.route('**/api/admin/channels**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ channels: [channel] }),
  }))
  await page.route('**/api/admin/model-providers**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ providers: [{ id: 1, code: 'anthropic', name: 'Anthropic', is_active: true }] }),
  }))
  await page.route('**/api/admin/model-groups**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/7/models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [{ id: 70, group_id: 7, routing_model: 'claude-sonnet-5-cc', channel_id: 155, channel }],
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groups: [{ id: 7, code: 'claude-cc', name: 'Claude CC', model_provider_id: 1, model_provider: 'Anthropic', is_active: true, model_count: 1 }],
      }),
    })
  })

  await page.goto('/admin/model-groups')
  await page.getByRole('row').filter({ hasText: 'claude-cc' }).click()

  const historicalRow = page.getByRole('row').filter({
    has: page.getByText('claude-sonnet-5-cc', { exact: true }),
  })
  const currentRow = page.getByRole('row').filter({
    has: page.getByText('claude-sonnet-5', { exact: true }),
  })

  await expect(page.getByText('已选 1 / 2', { exact: true })).toBeVisible()
  await expect(historicalRow).toHaveCount(1)
  await expect(historicalRow.getByRole('checkbox')).toBeChecked()
  await expect(currentRow.getByRole('checkbox')).not.toBeChecked()

  await historicalRow.getByRole('checkbox').click()
  await expect(page.getByText('已选 0 / 2', { exact: true })).toBeVisible()
})
```

- [ ] **Step 2: Run the test and verify the current implementation fails**

Run from `web/app`:

```powershell
$env:PLAYWRIGHT_PREVIEW_PORT = '4312'
npx playwright test tests/e2e/model-group-hidden-binding.spec.ts --project=chromium
```

Expected: FAIL because the page renders only `claude-sonnet-5`, displays `已选 1 / 1`, and has no row for `claude-sonnet-5-cc`.

### Task 2: Include Saved Binding Models In The Table

**Files:**
- Modify: `web/app/src/pages/admin/AdminModelGroupsPage.tsx:47-61`
- Test: `web/app/tests/e2e/model-group-hidden-binding.spec.ts`

- [ ] **Step 1: Add the saved bindings to the existing grouped options**

Insert this loop after the current `for (const channel of data.channels)` loop and before returning the sorted entries:

```typescript
    for (const binding of bindings) {
      const model = binding.routing_model?.trim()
      const channel = binding.channel ?? data.channels.find((item) => item.id === binding.channel_id)
      if (!model || !channel?.id) continue
      const options = grouped.get(model) ?? []
      if (!options.some((item) => item.id === channel.id)) options.push(channel)
      grouped.set(model, options)
    }
```

This deliberately keeps both names when a channel's current routing model differs from its saved binding name.

- [ ] **Step 2: Run the targeted test and verify it passes**

Run from `web/app`:

```powershell
$env:PLAYWRIGHT_PREVIEW_PORT = '4312'
npx playwright test tests/e2e/model-group-hidden-binding.spec.ts --project=chromium
```

Expected: `1 passed`.

- [ ] **Step 3: Commit the focused implementation**

```powershell
git add -- web/app/src/pages/admin/AdminModelGroupsPage.tsx web/app/tests/e2e/model-group-hidden-binding.spec.ts
git commit -m "fix: show historical model group bindings"
```

### Task 3: Verify The Frontend Regression Surface

**Files:**
- Verify: `web/app/src/pages/admin/AdminModelGroupsPage.tsx`
- Verify: `web/app/tests/e2e/model-group-hidden-binding.spec.ts`

- [ ] **Step 1: Run focused lint**

Run from `web/app`:

```powershell
npx eslint src/pages/admin/AdminModelGroupsPage.tsx tests/e2e/model-group-hidden-binding.spec.ts
```

Expected: exit code 0 with no errors.

- [ ] **Step 2: Run all frontend unit tests**

Run from `web/app`:

```powershell
$unitTests = (Get-ChildItem -LiteralPath 'tests\unit' -Filter '*.test.mjs').FullName
node --test $unitTests
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run the related model-group browser tests**

Run from `web/app`:

```powershell
$env:PLAYWRIGHT_PREVIEW_PORT = '4312'
npx playwright test tests/e2e/model-group-hidden-binding.spec.ts tests/e2e/model-group-toggle.spec.ts --project=chromium
```

Expected: `2 passed`.

- [ ] **Step 4: Build the production frontend**

Run from `web/app`:

```powershell
npm run build
```

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 5: Inspect the rendered target state**

Use the Browser integration against the local frontend when a usable authenticated backend is available. Otherwise use the mocked Playwright flow as the rendered interaction proof. Confirm the historical row is checked, the current row is unchecked, the count reads `已选 1 / 2`, clearing the historical checkbox changes it to `已选 0 / 2`, and no relevant console warning or error appears.

- [ ] **Step 6: Check the final diff and repository state**

```powershell
git diff --check HEAD^
git status --short
```

Expected: no whitespace errors; only pre-existing unrelated untracked files remain.
