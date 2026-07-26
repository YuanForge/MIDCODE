# Model Group Toggle UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit disable and enable controls to the admin model-groups table while preserving immediate new-request enforcement and preventing stale form state from undoing a toggle.

**Architecture:** Reuse the existing `adminApi.toggleModelGroup` endpoint from the current page. Keep one per-row pending ID in component state, confirm only destructive disable actions, synchronize the selected edit form after a successful toggle, and reload the existing group query. Verify the behavior through a browser-level mocked API flow rather than introducing a new component abstraction.

**Tech Stack:** React 19, TypeScript, Vite, Playwright, existing shadcn-style UI components, Go service tests.

---

## File Structure

- Create `web/app/tests/e2e/model-group-toggle.spec.ts`: exercises admin disable, confirmation, request payload, list refresh, stale-form protection, and re-enable behavior.
- Modify `web/app/src/pages/admin/AdminModelGroupsPage.tsx`: adds the row action and its pending/error/state synchronization logic.

### Task 1: Add the failing browser test

**Files:**
- Create: `web/app/tests/e2e/model-group-toggle.spec.ts`

- [ ] **Step 1: Write the failing Playwright scenario**

Create a test that installs an admin session, mocks public settings, channels, model-group list and binding endpoints, tracks mutable `isActive` state, accepts only the disable confirmation dialog, and records PATCH/PUT payloads. The core assertions are:

```ts
await page.goto('/admin/model-groups')
await page.getByRole('row', { name: /standard/ }).click()
await page.getByRole('button', { name: '停用' }).click()
await expect.poll(() => togglePayload).toEqual({ is_active: false })
await expect(page.getByText('停用', { exact: true }).first()).toBeVisible()

await page.getByRole('button', { name: '保存修改' }).click()
await expect.poll(() => updatePayload?.is_active).toBe(false)

await page.getByRole('button', { name: '启用' }).click()
await expect.poll(() => togglePayload).toEqual({ is_active: true })
expect(disableConfirmations).toBe(1)
```

The route handler for `PATCH /api/admin/model-groups/1/toggle` must set `isActive` from the JSON body, and the list handler must return that current value so the UI reload is observable.

- [ ] **Step 2: Run the test and verify RED**

Run from `web/app`:

```powershell
npx playwright test tests/e2e/model-group-toggle.spec.ts --project=chromium --workers=1
```

Expected: FAIL because the model-group row has no `停用` button.

- [ ] **Step 3: Commit the failing test**

```powershell
git add -- web/app/tests/e2e/model-group-toggle.spec.ts
git commit -m "test: cover model group status controls"
```

### Task 2: Implement the minimal row action

**Files:**
- Modify: `web/app/src/pages/admin/AdminModelGroupsPage.tsx`
- Test: `web/app/tests/e2e/model-group-toggle.spec.ts`

- [ ] **Step 1: Add pending state and the toggle handler**

Add one state value beside `saving`:

```tsx
const [togglingGroupID, setTogglingGroupID] = useState<number>()
```

Add the handler beside `remove`:

```tsx
async function toggle(group: AdminModelGroup) {
  if (!group.id) return
  const nextActive = group.is_active === false
  if (!nextActive && !window.confirm(`确认停用分组“${group.name || group.code}”？停用后新请求将立即停止使用该分组。`)) return
  setTogglingGroupID(group.id)
  setErrorText('')
  try {
    await adminApi.toggleModelGroup(group.id, nextActive)
    if (selectedGroupID === group.id) {
      setForm((current) => current.id === group.id ? { ...current, is_active: nextActive } : current)
    }
    reload()
  } catch (err) {
    const { getApiErrorMessage } = await import('@/lib/api/http')
    setErrorText(getApiErrorMessage(err))
  } finally {
    setTogglingGroupID(undefined)
  }
}
```

- [ ] **Step 2: Add the operation-column button**

Import `PowerIcon` from `lucide-react`. Insert this button between edit and delete, stopping row selection just like the existing controls:

```tsx
<Button
  size="sm"
  variant="ghost"
  disabled={togglingGroupID === group.id}
  onClick={(event) => {
    event.stopPropagation()
    void toggle(group)
  }}
>
  <PowerIcon data-icon="inline-start" />
  {togglingGroupID === group.id ? '处理中...' : group.is_active === false ? '启用' : '停用'}
</Button>
```

- [ ] **Step 3: Run the focused test and verify GREEN**

Run from `web/app`:

```powershell
npx playwright test tests/e2e/model-group-toggle.spec.ts --project=chromium --workers=1
```

Expected: PASS, including one disable confirmation, `{ is_active: false }`, stale-form protection, and `{ is_active: true }`.

- [ ] **Step 4: Run focused static and backend regression checks**

Run:

```powershell
Set-Location web/app
node --test tests/unit/model-group-batch.test.mjs
npm run build
npm run lint -- src/pages/admin/AdminModelGroupsPage.tsx tests/e2e/model-group-toggle.spec.ts
Set-Location ../..
go test ./internal/service -run ModelGroup -count=1
git diff --check
```

Expected: all commands exit 0. The Go test confirms the existing model-group service behavior remains green; no backend files should change.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- web/app/src/pages/admin/AdminModelGroupsPage.tsx
git commit -m "feat: toggle model group availability"
```

### Task 3: Visual verification and handoff

**Files:**
- No production file changes expected.

- [ ] **Step 1: Start the frontend server**

Run from `web/app` on an unused local port:

```powershell
npm run dev -- --host 127.0.0.1 --port 4310
```

Expected: Vite reports `http://127.0.0.1:4310/`.

- [ ] **Step 2: Inspect the page in the browser**

Open `/admin/model-groups` with mocked or locally available admin data. At 1440x900 verify that each row has an unambiguous enable/disable action, operation text fits without overlap, the selected-row treatment remains intact, and the right edit panel is unchanged.

- [ ] **Step 3: Capture the requested page image**

Capture the model-group page after one row is in the disabled state. Include the screenshot in the final response together with the local URL and exact verification commands.
