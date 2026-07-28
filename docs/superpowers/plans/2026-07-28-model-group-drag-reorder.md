# Model Group Drag Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected model-group cards visibly reorder with arrow controls and a dedicated drag handle while preserving the existing provider-scoped API order.

**Architecture:** Keep `selectedIds` as the sole persisted ordering state. Derive each provider's rendered card order from it, and route arrow and native drag interactions through one provider-scoped reorder function that replaces only that provider's slots in the global selection array.

**Tech Stack:** React 19, TypeScript, native HTML drag events, Lucide icons, Tailwind CSS, Playwright.

---

### Task 1: Lock Visible Reorder Behavior With A Failing Browser Test

**Files:**
- Modify: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`
- Test: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`

- [ ] **Step 1: Extend the existing binding-dialog flow with visible-order assertions**

After opening the OpenAI tab, locate cards through the intended stable attribute and assert arrow clicks move complete cards:

```ts
const openAIPanel = page.getByRole('tabpanel', { name: /^OpenAI/ })
const openAICards = openAIPanel.locator('[data-model-group-card]')

await expect(openAICards).toHaveText([/GPT K12/, /GPT Plus/])
await page.getByRole('button', { name: '下移 GPT K12' }).click()
await expect(openAICards).toHaveText([/GPT Plus/, /GPT K12/])
```

- [ ] **Step 2: Add the dedicated-handle drag assertion**

Use the intended accessible drag-handle name, verify the handle restores and then changes visible order, and retain the existing save-payload assertion:

```ts
await page.getByRole('button', { name: '拖动 GPT K12' }).dragTo(
  openAICards.filter({ hasText: 'GPT Plus' }),
)
await expect(openAICards).toHaveText([/GPT K12/, /GPT Plus/])

await page.getByRole('button', { name: '拖动 GPT Plus' }).dragTo(
  openAICards.filter({ hasText: 'GPT K12' }),
)
await expect(openAICards).toHaveText([/GPT Plus/, /GPT K12/])

await page.getByRole('button', { name: '保存排序' }).click()
await expect.poll(() => updatePayload?.group_ids).toEqual([2, 5, 3, 1, 4])
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
cd web/app
npx playwright test tests/e2e/api-key-model-group-provider.spec.ts
```

Expected: FAIL because `[data-model-group-card]` and `拖动 ...` handles do not exist, and current arrow interaction does not change card order.

- [ ] **Step 4: Commit the failing test**

```powershell
git add -- web/app/tests/e2e/api-key-model-group-provider.spec.ts
git commit -m "test: cover model group card reordering"
```

### Task 2: Render Selected Cards In Priority Order

**Files:**
- Modify: `web/app/src/components/shared/ModelGroupSelector.tsx`
- Test: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`

- [ ] **Step 1: Add a provider-order helper inside `ModelGroupSelector`**

Derive selected cards from global priority order and append unselected catalog cards unchanged:

```ts
function orderedProviderGroups(providerGroups: ApiKeyModelGroup[]) {
  const groupById = new Map(providerGroups.flatMap((group) => group.id ? [[group.id, group] as const] : []))
  const selected = selectedIds.flatMap((id) => {
    const group = groupById.get(id)
    return group ? [group] : []
  })
  const selectedSet = new Set(selected.flatMap((group) => group.id ? [group.id] : []))
  return [...selected, ...providerGroups.filter((group) => !group.id || !selectedSet.has(group.id))]
}
```

- [ ] **Step 2: Render the derived order and expose stable card semantics**

Replace `provider.groups.map(...)` with `orderedProviderGroups(provider.groups).map(...)` and mark each row:

```tsx
<div
  key={group.id}
  data-model-group-card={group.id}
  data-model-group-selected={selected ? 'true' : 'false'}
  className="grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 transition-colors"
>
```

- [ ] **Step 3: Run the focused test to confirm arrow behavior advances**

Run:

```powershell
cd web/app
npx playwright test tests/e2e/api-key-model-group-provider.spec.ts
```

Expected: the arrow visible-order assertion passes; the test still fails at the missing drag handle.

- [ ] **Step 4: Commit the arrow fix**

```powershell
git add -- web/app/src/components/shared/ModelGroupSelector.tsx
git commit -m "fix: render model groups in selected order"
```

### Task 3: Add Provider-Scoped Handle Dragging

**Files:**
- Modify: `web/app/src/components/shared/ModelGroupSelector.tsx`
- Test: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`

- [ ] **Step 1: Add the icon and transient drag state**

```tsx
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from 'lucide-react'

const [draggedGroupId, setDraggedGroupId] = useState<number>()
```

- [ ] **Step 2: Generalize provider-scoped reordering**

Replace direction-only swapping with a helper that moves a source selected ID to a target selected ID while replacing only the same provider slots in `selectedIds`:

```ts
function reorder(providerGroups: ApiKeyModelGroup[], sourceId: number, targetId: number) {
  const providerIds = new Set(providerGroups.flatMap((group) => group.id ? [group.id] : []))
  const ordered = selectedIds.filter((id) => providerIds.has(id))
  const sourceIndex = ordered.indexOf(sourceId)
  const targetIndex = ordered.indexOf(targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
  const [source] = ordered.splice(sourceIndex, 1)
  ordered.splice(targetIndex, 0, source)
  let cursor = 0
  onChange(selectedIds.map((id) => providerIds.has(id) ? ordered[cursor++] : id))
}

function move(providerGroups: ApiKeyModelGroup[], id: number, direction: -1 | 1) {
  const ordered = selectedIds.filter((selectedId) => providerGroups.some((group) => group.id === selectedId))
  const index = ordered.indexOf(id)
  const targetId = ordered[index + direction]
  if (targetId !== undefined) reorder(providerGroups, id, targetId)
}
```

- [ ] **Step 3: Add the handle and drag feedback**

Render the handle only for selected groups in active providers. The card accepts drag-over events and reorders immediately on entry:

```tsx
<div
  data-model-group-card={group.id}
  data-model-group-selected={selected ? 'true' : 'false'}
  onDragOver={(event) => {
    if (draggedGroupId !== undefined && selected) event.preventDefault()
  }}
  onDragEnter={() => {
    if (draggedGroupId !== undefined && selected) reorder(provider.groups, draggedGroupId, group.id as number)
  }}
  className={`grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 transition-[border-color,box-shadow,opacity,background-color] ${draggedGroupId === group.id ? 'border-primary/60 bg-primary/5 opacity-60 shadow-sm' : ''}`}
>
```

Place this before the priority badge in the selected controls:

```tsx
<Button
  type="button"
  size="icon-sm"
  variant="ghost"
  draggable
  aria-label={`拖动 ${name}`}
  className="cursor-grab active:cursor-grabbing"
  onDragStart={(event) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(group.id))
    setDraggedGroupId(group.id as number)
  }}
  onDragEnd={() => setDraggedGroupId(undefined)}
>
  <GripVerticalIcon />
</Button>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
cd web/app
npx playwright test tests/e2e/api-key-model-group-provider.spec.ts
```

Expected: PASS, including arrow movement, both handle drags, payload order, disabled-provider retention, and mobile overflow.

- [ ] **Step 5: Commit the drag implementation**

```powershell
git add -- web/app/src/components/shared/ModelGroupSelector.tsx
git commit -m "feat: drag model groups by priority handle"
```

### Task 4: Build And Rendered QA

**Files:**
- Verify: `web/app/src/components/shared/ModelGroupSelector.tsx`
- Verify: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`

- [ ] **Step 1: Run frontend static verification**

```powershell
cd web/app
npm run build
npm run lint
```

Expected: build succeeds; lint reports no new errors.

- [ ] **Step 2: Run the complete frontend browser suite**

```powershell
cd web/app
npx playwright test
```

Expected: all configured Playwright tests pass.

- [ ] **Step 3: Rebuild and restart the local MidCode demo**

```powershell
cd web/app
npm run build
```

Serve the rebuilt `web/app/dist` through the existing mock API server, restarting only the temporary demo process when required.

- [ ] **Step 4: Verify the rendered interaction in the in-app browser**

At `http://127.0.0.1:4305/keys`, open `分组排序`, switch to OpenAI, and verify:

1. Arrow click moves the complete card immediately.
2. Dragging from the six-dot handle moves the card and shows source-card feedback.
3. Saving updates the table order.
4. Desktop and 390px dialog layouts do not overflow.
5. Page title/content are correct, no framework overlay is present, and console error/warn logs contain no relevant application failures.

- [ ] **Step 5: Run final repository checks**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only the committed implementation plus the pre-existing untracked `.superpowers/` directory remain.
