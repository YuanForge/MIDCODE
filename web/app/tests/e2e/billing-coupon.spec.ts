import { expect, test, type Page } from '@playwright/test'

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const OK = { valid: true, coupon_id: 1, discount_yuan: 10, final_amount: 90, discount_type: 'fixed', discount_value: 1000 }

/**
 * The recharge page of a signed-in user, with the Epay gateway on and a 100-yuan package, and 100 yuan typed in.
 * Every order the page creates lands in `orders`, and every coupon check in `checks`. `answer` says how the server
 * replies to a coupon check.
 */
async function openRecharge(page: Page, answer: () => ReturnType<typeof json>) {
  const orders: Array<Record<string, unknown>> = []
  const checks: string[] = []
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/public/settings', (route) =>
    route.fulfill(json({ settings: { site_name: 'MidCode', logo_url: '', epay_enabled: 'true', recharge_allow_custom: 'true', recharge_plans: JSON.stringify([{ amount: 100, credits: 100, bonus: 10 }]) } })),
  )
  await page.route('**/api/user/profile', (route) => route.fulfill(json({ id: 1, username: 'payer', email: 'payer@example.test', group: '默认' })))
  await page.route('**/api/user/balance', (route) => route.fulfill(json({ balance_credits: 1_000_000 })))
  await page.route('**/api/user/model-credits', (route) => route.fulfill(json({ model_credits: [] })))
  await page.route('**/api/user/apikeys', (route) => route.fulfill(json({ api_keys: [] })))
  await page.route('**/api/user/cards/redeem-history**', (route) => route.fulfill(json({ records: [] })))
  await page.route('**/api/user/coupons/validate**', (route) => {
    const url = new URL(route.request().url())
    checks.push(`${url.searchParams.get('code')}@${url.searchParams.get('amount')}`)
    return route.fulfill(answer())
  })
  await page.route('**/api/pay/epay/create', (route) => {
    orders.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill(json({ pay_url: 'about:blank', out_trade_no: 'T-1' }))
  })
  await page.route('**/api/pay/order/status**', (route) => route.fulfill(json({ status: 'pending' })))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/billing')
  await page.locator('#recharge-custom-amount').fill('100')
  return { orders, checks }
}

test('a validated coupon lowers what is paid, and the order carries the price before it', async ({ page }) => {
  const { orders, checks } = await openRecharge(page, () => json(OK))
  await page.locator('#recharge-coupon').fill('WELCOME10')
  await page.getByRole('button', { name: '验证', exact: true }).click()
  await expect(page.getByText('已优惠 ¥10.00，到账积分不变')).toBeVisible()
  expect(checks).toEqual(['WELCOME10@100'])

  const pay = page.getByRole('button', { name: /立即支付/ })
  await expect(pay).toHaveText('立即支付 ¥90.00')
  await pay.click()
  // The order is for the price before the coupon. The server applies the coupon, charges 90 and credits the full package.
  await expect.poll(() => orders).toEqual([{ amount: 100, type: 'wxpay', coupon_code: 'WELCOME10' }])
})

test('a coupon that was typed but not checked is never dropped silently', async ({ page }) => {
  const { orders } = await openRecharge(page, () => json(OK))
  const pay = page.getByRole('button', { name: /立即支付/ })
  await page.locator('#recharge-coupon').fill('WELCOME10')
  await pay.click()
  await expect(page.getByText('优惠券还没有验证：点「验证」使用它，或清空券码后再支付')).toBeVisible()
  expect(orders).toEqual([])

  // Checked, then the amount changes: the discount belonged to the old amount, so it is gone and the code must be checked again.
  await page.getByRole('button', { name: '验证', exact: true }).click()
  await expect(page.getByText(/已优惠/)).toBeVisible()
  await page.locator('#recharge-custom-amount').fill('200')
  await expect(page.getByText(/已优惠/)).toHaveCount(0)
  await expect(pay).toHaveText('立即支付 ¥200.00')
  await pay.click()
  expect(orders).toEqual([])

  // With the code cleared the order goes out as it always did, with no coupon in it.
  await page.locator('#recharge-coupon').fill('')
  await pay.click()
  await expect.poll(() => orders).toEqual([{ amount: 200, type: 'wxpay' }])
})

test('why a coupon was refused is shown in the words of the server', async ({ page }) => {
  const { orders } = await openRecharge(page, () => json({ error: '优惠券已过期' }, 400))
  await page.locator('#recharge-coupon').fill('OLD')
  await page.getByRole('button', { name: '验证', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '优惠券已过期' })).toBeVisible()
  await expect(page.getByText(/已优惠/)).toHaveCount(0)
  expect(orders).toEqual([])
})
