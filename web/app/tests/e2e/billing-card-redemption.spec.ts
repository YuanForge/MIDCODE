import { expect, test, type Page } from '@playwright/test'

type BillingMockOptions = {
  cardPurchaseUrl?: string
  redeemError?: boolean
}

type BillingMockState = {
  balanceCredits: number
  redemptionHistory: Array<{ code: string; credits: number; used_at: string }>
  redeemRequests: string[]
  redeemMethods: string[]
}

async function mockBillingApi(page: Page, options: BillingMockOptions = {}) {
  const state: BillingMockState = {
    balanceCredits: 1_000_000,
    redemptionHistory: [],
    redeemRequests: [],
    redeemMethods: [],
  }
  const cardPurchaseUrl = options.cardPurchaseUrl ?? 'https://cards.example.test/store'

  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'mock-user-token')
  })

  await page.route('**/api/public/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        settings: {
          site_name: 'MidCode',
          logo_url: '',
          card_purchase_url: cardPurchaseUrl,
          epay_enabled: 'true',
          recharge_allow_custom: 'true',
          recharge_plans: JSON.stringify([{ amount: 100, credits: 100, bonus: 10 }]),
        },
      }),
    })
  })
  await page.route('**/api/user/profile', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, username: 'billing-user', email: 'billing@example.test', group: '默认' }) })
  })
  await page.route('**/api/user/balance', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance_credits: state.balanceCredits }) })
  })
  await page.route('**/api/user/model-credits', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model_credits: [] }) })
  })
  await page.route('**/api/user/apikeys', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ api_keys: [] }) })
  })
  await page.route('**/api/user/transactions**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) })
  })
  await page.route('**/api/user/payment-orders**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [], total: 0 }) })
  })
  await page.route('**/api/user/cards/redeem-history**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: state.redemptionHistory }) })
  })
  await page.route('**/api/user/cards/redeem', async (route) => {
    state.redeemMethods.push(route.request().method())
    const payload = route.request().postDataJSON() as { code?: unknown }
    state.redeemRequests.push(String(payload.code ?? ''))
    await new Promise((resolve) => setTimeout(resolve, 150))

    if (options.redeemError) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: '卡密无效' }) })
      return
    }

    state.balanceCredits = 2_000_000
    state.redemptionHistory.unshift({ code: state.redeemRequests.at(-1) ?? '', credits: 1_000_000, used_at: '2026-08-22T09:00:00+08:00' })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ credits: 1_000_000 }) })
  })

  return state
}

function billingCard(page: Page, title: string) {
  return page.locator('[data-slot="card"]', { has: page.getByRole('heading', { name: title, exact: true }) })
}

test('redeems a card in billing and refreshes history and balance', async ({ page }) => {
  const state = await mockBillingApi(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/billing?tab=recharge')

  await expect(page.getByRole('heading', { name: '卡密充值', exact: true })).toBeVisible()
  const purchaseLink = page.getByRole('link', { name: '购买卡密', exact: true })
  await expect(purchaseLink).toHaveAttribute('href', 'https://cards.example.test/store')
  await expect(purchaseLink).toHaveAttribute('target', '_blank')
  const rel = await purchaseLink.getAttribute('rel')
  expect(rel?.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
  await expect(billingCard(page, '当前积分').getByText('1.00', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /100 积分/ })).toBeVisible()
  await expect(page.getByPlaceholder('请输入金额')).toBeVisible()
  await expect(page.getByPlaceholder('输入优惠券码')).toBeVisible()
  await expect(page.getByRole('button', { name: /立即支付/ })).toBeVisible()

  const codeInput = page.getByPlaceholder('请输入卡密')
  await codeInput.fill('  CARD-100  ')
  await codeInput.press('Enter')
  await expect(page.getByRole('button', { name: '兑换中...', exact: true })).toBeVisible()
  await codeInput.press('Enter')
  await expect.poll(() => state.redeemRequests).toEqual(['CARD-100'])

  await expect(billingCard(page, '卡密兑换记录').getByText('CARD-100', { exact: true })).toBeVisible()
  await expect(billingCard(page, '当前积分').getByText('2.00', { exact: true })).toBeVisible()
  await expect(codeInput).toHaveValue('')
  await expect(page.getByText('兑换成功，获得 1.00 积分', { exact: true })).toBeVisible()
  expect(state.redeemRequests).toHaveLength(1)
  expect(state.redeemMethods).toEqual(['POST'])
})

test('shows an accessible redemption error without clearing the card code', async ({ page }) => {
  const state = await mockBillingApi(page, { redeemError: true })
  await page.goto('/billing?tab=recharge')

  const codeInput = page.getByPlaceholder('请输入卡密')
  await codeInput.fill('BAD-CARD')
  await page.getByRole('button', { name: '立即兑换', exact: true }).click()

  await expect(codeInput).toHaveAttribute('aria-invalid', 'true')
  const describedBy = await codeInput.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  const alert = page.locator(`#${describedBy}`)
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute('role', 'alert')
  await expect(alert).toHaveText('卡密无效')
  await expect(codeInput).toHaveValue('BAD-CARD')
  expect(state.redeemRequests).toEqual(['BAD-CARD'])
  expect(state.redeemMethods).toEqual(['POST'])
})

test('keeps redemption available when no purchase URL is configured', async ({ page }) => {
  await mockBillingApi(page, { cardPurchaseUrl: '' })
  await page.goto('/billing?tab=recharge')

  await expect(page.getByRole('link', { name: '购买卡密', exact: true })).toHaveCount(0)
  const codeInput = page.getByPlaceholder('请输入卡密')
  const redeemButton = page.getByRole('button', { name: '立即兑换', exact: true })
  await expect(codeInput).toBeVisible()
  await expect(redeemButton).toBeDisabled()
  await codeInput.fill('READY-CARD')
  await expect(redeemButton).toBeEnabled()
})

test('redirects old exchange links and keeps the consolidated layout usable on mobile', async ({ page }) => {
  await mockBillingApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/exchange')

  await expect(page).toHaveURL(/\/billing\?tab=recharge$/)
  await expect(page.getByRole('heading', { name: '卡密充值', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/exchange"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Exchange Center/i })).toHaveCount(0)

  const historyScroller = billingCard(page, '卡密兑换记录').locator('[data-slot="table-container"]')
  await expect(historyScroller).toBeVisible()
  await expect.poll(async () => historyScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport)
})
