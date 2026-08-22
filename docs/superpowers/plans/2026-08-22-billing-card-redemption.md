# Billing Card Redemption Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate card-code purchase, redemption, and redemption history into the points recharge tab while preserving old `/exchange` bookmarks and all existing online-payment behavior.

**Architecture:** Extract the standalone redemption workflow into a page-specific `CardRedemptionSection` component. Render it from `UserBillingPage`, use a callback to refresh the billing balance after redemption, remove the duplicate navigation/page, and redirect `/exchange` to `/billing?tab=recharge`.

**Tech Stack:** React 19, TypeScript, React Router, Tailwind/shadcn UI, Node test runner source-contract tests, Playwright, Vite.

---

### Task 1: Create an isolated implementation worktree

**Files:**
- No tracked files changed.
- Worktree: `D:\gocode\FanAPI-worktrees\billing-card-redemption`

- [ ] **Step 1: Verify the source checkout before branching**

Run from `D:\gocode\FanAPI`:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse main
```

Expected: `main` contains the approved design commit, and only the pre-existing
`.superpowers/` plus `docs/upgrade-v1.0.39-to-v1.0.43.md` are untracked.

- [ ] **Step 2: Create the feature worktree**

```powershell
New-Item -ItemType Directory -Force 'D:\gocode\FanAPI-worktrees' | Out-Null
git worktree add 'D:\gocode\FanAPI-worktrees\billing-card-redemption' -b codex/billing-card-redemption main
```

Expected: the new worktree checks out `codex/billing-card-redemption` at the
same commit as `main`, without copying unrelated untracked files.

- [ ] **Step 3: Verify the worktree baseline**

Run from `D:\gocode\FanAPI-worktrees\billing-card-redemption`:

```powershell
git status --short --branch
git log -1 --oneline
```

Expected: a clean `codex/billing-card-redemption` branch containing the approved
design document.

### Task 2: Move the redemption workflow into a focused billing component

**Files:**
- Create: `web/app/src/pages/user/CardRedemptionSection.tsx`
- Modify: `web/app/src/pages/user/UserBillingPage.tsx:1-31,301-356`
- Modify: `web/app/tests/unit/user-billing-plans.test.mjs`

- [ ] **Step 1: Write the failing ownership contract**

Replace the card-purchase test in
`web/app/tests/unit/user-billing-plans.test.mjs` with this test while retaining
the existing recharge-plan test:

```js
test('billing owns card purchase, redemption, history, and balance refresh', async () => {
  const [billingPage, redemptionSection, settingsHook] = await Promise.all([
    source('src/pages/user/UserBillingPage.tsx'),
    source('src/pages/user/CardRedemptionSection.tsx'),
    source('src/hooks/use-site-settings.ts'),
  ])

  assert.match(settingsHook, /cardPurchaseUrl/)
  assert.match(billingPage, /CardRedemptionSection/)
  assert.match(billingPage, /purchaseUrl=\{settings\.cardPurchaseUrl\}/)
  assert.match(billingPage, /onRedeemed=\{reloadBalance\}/)
  assert.match(redemptionSection, /userApi\.redeemCard/)
  assert.match(redemptionSection, /userApi\.getRedeemHistory/)
  assert.match(redemptionSection, /购买卡密/)
  assert.match(redemptionSection, /target="_blank"/)
  assert.match(redemptionSection, /rel="noopener noreferrer"/)
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run from `web/app`:

```powershell
node --test tests/unit/user-billing-plans.test.mjs
```

Expected: FAIL because `CardRedemptionSection.tsx` does not exist.

- [ ] **Step 3: Create the focused redemption component**

Create `web/app/src/pages/user/CardRedemptionSection.tsx`:

```tsx
import { useState } from 'react'
import { ExternalLinkIcon, TicketIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageSection } from '@/components/shared/PageSection'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { userApi, type RedeemRecord } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'

type CardRedemptionSectionProps = {
  purchaseUrl: string
  onRedeemed: () => void
}

export function CardRedemptionSection({
  purchaseUrl,
  onRedeemed,
}: CardRedemptionSectionProps) {
  const { data: history, loading, error: loadError, reload } = useAsync(async () => {
    const response = await userApi.getRedeemHistory()
    return Array.isArray(response) ? response : response.records ?? response.list ?? []
  }, [] as RedeemRecord[])
  const [code, setCode] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function redeem() {
    const trimmedCode = code.trim()
    if (!trimmedCode || submitting) return

    setSubmitting(true)
    setMutationError('')
    try {
      const response = await userApi.redeemCard(trimmedCode) as { credits?: number }
      const credits = typeof response.credits === 'number' ? response.credits : null
      toast.success(credits ? `兑换成功，获得 ${formatCredits(credits)} 积分` : '兑换成功')
      setCode('')
      reload()
      onRedeemed()
    } catch (error) {
      const message = getApiErrorMessage(error)
      setMutationError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageSection title="卡密充值" description="输入卡密即可兑换积分，到账后余额会立即更新。">
        {loadError || mutationError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{mutationError || loadError}</AlertDescription>
          </Alert>
        ) : null}
        {purchaseUrl ? (
          <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">没有卡密？可前往发卡网购买后直接在此兑换。</span>
            <Button asChild variant="outline" size="sm">
              <a href={purchaseUrl} target="_blank" rel="noopener noreferrer">
                购买卡密
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </Button>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="请输入卡密"
            onKeyDown={(event) => event.key === 'Enter' && void redeem()}
          />
          <Button onClick={() => void redeem()} disabled={submitting || !code.trim()}>
            {submitting ? '兑换中...' : '立即兑换'}
          </Button>
        </div>
      </PageSection>

      <PageSection title="卡密兑换记录" description="展示已使用卡密、到账积分和兑换时间。">
        <div className="overflow-x-auto">
          <Table className="min-w-[620px]">
            <TableHeader>
              <TableRow>
                <TableHead>兑换码</TableHead>
                <TableHead>积分数量</TableHead>
                <TableHead>兑换时间</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton cols={3} />
            ) : (
              <TableBody>
                {history.length === 0 ? (
                  <TableEmpty
                    cols={3}
                    Icon={TicketIcon}
                    title="还没有兑换记录"
                    description="使用上方输入框兑换卡密后，记录会显示在这里。"
                  />
                ) : (
                  history.map((row, index) => (
                    <TableRow key={row.id ?? row.code ?? index}>
                      <TableCell className="font-mono text-xs">{row.code ?? '-'}</TableCell>
                      <TableCell>{formatCredits(row.credits ?? 0)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.used_at ? new Date(row.used_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            )}
          </Table>
        </div>
      </PageSection>
    </>
  )
}
```

- [ ] **Step 4: Wire the component into the recharge tab**

In `UserBillingPage.tsx`, add:

```tsx
import { CardRedemptionSection } from './CardRedemptionSection'
```

Remove `ExternalLinkIcon` from the Lucide import and replace the old standalone
`Purchase Card Code` section with:

```tsx
<CardRedemptionSection
  purchaseUrl={settings.cardPurchaseUrl}
  onRedeemed={reloadBalance}
/>
```

Keep this block after the balance/model-credit summaries and before the existing
online recharge `PageSection`. Do not alter payment, package, custom amount, or
coupon state and handlers.

- [ ] **Step 5: Run the focused contract and build**

Run from `web/app`:

```powershell
node --test tests/unit/user-billing-plans.test.mjs
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the component migration**

```powershell
git add -- web/app/src/pages/user/CardRedemptionSection.tsx web/app/src/pages/user/UserBillingPage.tsx web/app/tests/unit/user-billing-plans.test.mjs
git commit -m "feat: move card redemption into billing"
```

### Task 3: Remove the duplicate entry and preserve the old route

**Files:**
- Modify: `web/app/src/app/router.tsx:21-37,176-180`
- Modify: `web/app/src/layouts/ConsoleLayout.tsx:410-419`
- Modify: `web/app/src/pages/admin/AdminSettingsPage.tsx:461-464`
- Delete: `web/app/src/pages/user/UserExchangePage.tsx`
- Create: `web/app/tests/unit/billing-card-redemption-navigation.test.mjs`
- Modify: `web/app/tests/e2e/app.spec.ts:335-342`

- [ ] **Step 1: Write the failing navigation and compatibility contract**

Create `web/app/tests/unit/billing-card-redemption-navigation.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('exchange navigation is consolidated and old links redirect to billing', async () => {
  const [router, navigation, adminSettings] = await Promise.all([
    source('src/app/router.tsx'),
    source('src/layouts/ConsoleLayout.tsx'),
    source('src/pages/admin/AdminSettingsPage.tsx'),
  ])

  assert.doesNotMatch(router, /const UserExchangePage/)
  assert.match(router, /path: '\/exchange', element: <Navigate replace to="\/billing\?tab=recharge" \/>/)
  assert.doesNotMatch(navigation, /href: '\/exchange'/)
  assert.match(adminSettings, /用户端「积分充值」会显示购买卡密入口/)
  assert.doesNotMatch(adminSettings, /「兑换中心」/)
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run from `web/app`:

```powershell
node --test tests/unit/billing-card-redemption-navigation.test.mjs
```

Expected: FAIL because the old lazy import, route, sidebar entry, and admin copy
still exist.

- [ ] **Step 3: Implement the redirect and navigation cleanup**

In `router.tsx`:

- remove the `UserExchangePage` lazy import;
- replace the `/exchange` route with exactly:

```tsx
{ path: '/exchange', element: <Navigate replace to="/billing?tab=recharge" /> },
```

In `ConsoleLayout.tsx`, remove only this item:

```tsx
{ label: '兑换中心', labelKey: 'layout.navExchange', href: '/exchange', icon: TicketIcon },
```

Keep the `TicketIcon` import because the admin coupon navigation also uses it.

In `AdminSettingsPage.tsx`, change the tip to:

```tsx
<Tip>填写后用户端「积分充值」会显示购买卡密入口；留空则不显示。</Tip>
```

Delete `web/app/src/pages/user/UserExchangePage.tsx`.

- [ ] **Step 4: Update route smoke coverage**

Remove `/exchange` from the generic route loop in `app.spec.ts`. Add this focused
assertion after the loop, using the same authenticated mocks:

```ts
await page.goto('/exchange')
await expect(page).toHaveURL(/\/billing\?tab=recharge$/)
await expect(page.getByRole('tab', { name: '积分充值' })).toHaveAttribute('data-state', 'active')
await expect(page.getByRole('heading', { name: '卡密充值' })).toBeVisible()
```

- [ ] **Step 5: Run the focused tests and build**

Run from `web/app`:

```powershell
node --test tests/unit/user-billing-plans.test.mjs tests/unit/billing-card-redemption-navigation.test.mjs
npm run build
```

Expected: PASS, and TypeScript reports no deleted-page imports.

- [ ] **Step 6: Commit compatibility cleanup**

```powershell
git add -- web/app/src/app/router.tsx web/app/src/layouts/ConsoleLayout.tsx web/app/src/pages/admin/AdminSettingsPage.tsx web/app/src/pages/user/UserExchangePage.tsx web/app/tests/unit/billing-card-redemption-navigation.test.mjs web/app/tests/e2e/app.spec.ts
git commit -m "refactor: consolidate exchange navigation"
```

### Task 4: Prove the complete billing redemption interaction

**Files:**
- Create: `web/app/tests/e2e/billing-card-redemption.spec.ts`

- [ ] **Step 1: Add a browser test with stateful API mocks**

Create `web/app/tests/e2e/billing-card-redemption.spec.ts` with three tests. The
shared setup must:

```ts
import { expect, test, type Page } from '@playwright/test'

async function installBillingMocks(page: Page, purchaseUrl = 'https://cards.example.test/store') {
  let balance = 1_000_000
  let history: Array<{ id: number; code: string; credits: number; used_at: string }> = []
  let redeemedCode = ''

  await page.addInitScript(() => localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/public/settings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      settings: {
        site_name: 'MidCode',
        card_purchase_url: purchaseUrl,
        epay_enabled: 'true',
        recharge_allow_custom: 'true',
        recharge_plans: JSON.stringify([{ amount: 100, credits: 100, bonus: 10 }]),
      },
    }),
  }))
  await page.route('**/api/user/profile', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 7, username: 'billing-user', email: 'user@example.test', group: 'default' }),
  }))
  await page.route('**/api/user/balance', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ balance_credits: balance }),
  }))
  await page.route('**/api/user/model-credits', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"model_credits":[]}' }))
  await page.route('**/api/user/apikeys', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"api_keys":[]}' }))
  await page.route('**/api/user/transactions**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"total":0}' }))
  await page.route('**/api/user/payment-orders**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"orders":[],"total":0}' }))
  await page.route('**/api/user/cards/redeem-history**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ records: history }),
  }))
  await page.route('**/api/user/cards/redeem', async (route) => {
    const body = route.request().postDataJSON() as { code: string }
    redeemedCode = body.code
    balance = 2_000_000
    history = [{ id: 1, code: body.code, credits: 1_000_000, used_at: '2026-08-22T20:00:00+08:00' }]
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"credits":1000000}' })
  })

  return { redeemedCode: () => redeemedCode }
}
```

The main test must execute and assert the real interaction:

```ts
test('redeems a card in billing and refreshes history and balance', async ({ page }) => {
  const state = await installBillingMocks(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/billing?tab=recharge')

  await expect(page.getByRole('heading', { name: '卡密充值' })).toBeVisible()
  await expect(page.getByRole('link', { name: '购买卡密' })).toHaveAttribute('href', 'https://cards.example.test/store')
  await expect(page.getByRole('link', { name: '购买卡密' })).toHaveAttribute('target', '_blank')
  await expect(page.getByText('1.00', { exact: true })).toBeVisible()
  await expect(page.getByText('100 积分')).toBeVisible()
  await expect(page.getByText('自定义金额')).toBeVisible()
  await expect(page.getByPlaceholder('输入优惠券码')).toBeVisible()
  await expect(page.getByRole('button', { name: /立即支付/ })).toBeVisible()

  await page.getByPlaceholder('请输入卡密').fill('  FANAPI-TEST-CODE  ')
  await page.getByRole('button', { name: '立即兑换' }).click()

  await expect.poll(state.redeemedCode).toBe('FANAPI-TEST-CODE')
  await expect(page.getByText('FANAPI-TEST-CODE')).toBeVisible()
  await expect(page.getByText('2.00', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('请输入卡密')).toHaveValue('')
})
```

The compatibility/mobile test must assert redirect, removed navigation, and no
page-level horizontal overflow:

```ts
test('redirects old exchange links and keeps the consolidated layout usable on mobile', async ({ page }) => {
  await installBillingMocks(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/exchange')

  await expect(page).toHaveURL(/\/billing\?tab=recharge$/)
  await expect(page.getByRole('heading', { name: '卡密充值' })).toBeVisible()
  await expect(page.getByRole('link', { name: '兑换中心' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
```

The third test must prove an empty admin URL hides only the purchase action:

```ts
test('keeps card redemption available when no purchase URL is configured', async ({ page }) => {
  await installBillingMocks(page, '')
  await page.goto('/billing?tab=recharge')

  await expect(page.getByRole('link', { name: '购买卡密' })).toHaveCount(0)
  await expect(page.getByPlaceholder('请输入卡密')).toBeVisible()
  await expect(page.getByRole('button', { name: '立即兑换' })).toBeDisabled()
})
```

- [ ] **Step 2: Build the preview and run the focused browser test**

Run from `web/app`:

```powershell
npm run build
$env:PLAYWRIGHT_PREVIEW_PORT = '4313'
npx playwright test tests/e2e/billing-card-redemption.spec.ts --project=chromium --workers=1
```

Expected: 3 tests PASS. Inspect the captured page at both 1280x900 and 390x844
if a failure produces a trace or screenshot.

- [ ] **Step 3: Commit browser coverage**

```powershell
git add -- web/app/tests/e2e/billing-card-redemption.spec.ts
git commit -m "test: cover billing card redemption flow"
```

### Task 5: Run complete verification and review the diff

**Files:**
- Verify all files changed by Tasks 2-4.

- [ ] **Step 1: Run all frontend unit tests**

Run from `web/app`:

```powershell
node --test tests/unit/*.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Run lint and the production build**

```powershell
npm run lint
npm run build
```

Expected: both PASS. If lint exposes unrelated pre-existing failures, record
them separately and run ESLint against every touched TypeScript file; do not
modify unrelated code.

- [ ] **Step 3: Run route and focused browser regression coverage**

```powershell
$env:PLAYWRIGHT_PREVIEW_PORT = '4313'
npx playwright test tests/e2e/billing-card-redemption.spec.ts tests/e2e/app.spec.ts --project=chromium --workers=1
```

Expected: all selected tests PASS, including `/exchange` redirect coverage.

- [ ] **Step 4: Review scope and repository state**

Run from the feature worktree root:

```powershell
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short --branch
git log --oneline main..HEAD
```

Expected: only the approved billing/card/navigation/admin/test files changed;
the worktree is clean; no backend, schema, payment, coupon, or generated output
files changed.

### Task 6: Merge to main and publish version tags

**Files:**
- Git refs only after verification.

- [ ] **Step 1: Refresh remote state and verify merge safety**

Run from `D:\gocode\FanAPI`:

```powershell
git fetch origin main --tags
git status --short --branch
git rev-list --left-right --count main...origin/main
git log --oneline main..codex/billing-card-redemption
```

Expected: unrelated untracked files remain untouched. If `origin/main` moved,
integrate it before merging and rerun Task 5.

- [ ] **Step 2: Fast-forward the verified feature branch into main**

```powershell
git merge --ff-only codex/billing-card-redemption
```

Expected: `main` advances to the verified feature commit without a conflict or
synthetic merge commit.

- [ ] **Step 3: Recheck the merged commit before tagging**

```powershell
git status --short --branch
git log -5 --oneline --decorate
git tag --list 'v1.0.*' --sort=-version:refname | Select-Object -First 3
```

Expected: `v1.0.48` is the previous release, so the next tag is `v1.0.49` unless
a newer remote release appeared during fetch.

- [ ] **Step 4: Create the release and moving tags**

```powershell
git tag -a v1.0.49 -m "v1.0.49" HEAD
git tag -f latest HEAD
```

Expected: both local tags resolve to the merged implementation commit.

- [ ] **Step 5: Push main and tags atomically**

```powershell
git push --atomic origin main refs/tags/v1.0.49 +refs/tags/latest
```

Expected: the remote accepts all three ref updates together.

- [ ] **Step 6: Verify authoritative remote refs**

```powershell
git fetch origin main --tags --force
git rev-parse main
git rev-parse origin/main
git rev-list -n 1 v1.0.49
git rev-list -n 1 latest
git ls-remote origin refs/heads/main refs/tags/v1.0.49 refs/tags/v1.0.49^{} refs/tags/latest refs/tags/latest^{}
```

Expected: `main`, `origin/main`, peeled `v1.0.49`, and peeled `latest` all resolve
to the same implementation commit. Report repository publication separately
from production deployment, which requires independent runtime evidence.
