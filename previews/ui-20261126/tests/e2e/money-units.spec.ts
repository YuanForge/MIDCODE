import { expect, test, type Page } from '@playwright/test'

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

type Sent = Array<Record<string, unknown>>

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/settings', (route) => route.fulfill(json({ settings: { site_name: 'MidCode', logo_url: '' } })))
  await page.setViewportSize({ width: 1440, height: 900 })
})

/** The administrator console with one account, 10482, holding 128.40 yuan. Every adjustment the page sends lands in `sent`. */
async function openAdjust(page: Page, sent: Sent) {
  await page.addInitScript(() => window.localStorage.setItem('admin_token', 'mock-admin-token'))
  const accounts = [{ id: 10482, username: 'lin_chen', email: 'lin.chen@example.com', is_active: true, balance: 128_400_000 }]
  await page.route('**/api/admin/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/admin/me') return route.fulfill(json({ permissions: ['*'] }))
    if (url.pathname === '/api/admin/users') {
      const uid = Number(url.searchParams.get('uid'))
      return route.fulfill(json({ users: accounts.filter((account) => account.id === uid), total: 1 }))
    }
    if (url.pathname === '/api/admin/transactions/adjust') {
      sent.push(route.request().postDataJSON())
      return route.fulfill(json({ ok: true, balance_after: 140_900_000 }))
    }
    return route.fulfill(json({}))
  })
  await page.goto('/admin/billing')
  await page.getByRole('button', { name: '手动调账' }).click()
  return page.getByRole('dialog')
}

test('a manual adjustment is sent in micro-credits, positive to add and negative to take', async ({ page }) => {
  const sent: Sent = []
  const dialog = await openAdjust(page, sent)
  await dialog.getByLabel('用户 ID').fill('10482')
  await expect(dialog.getByText('lin_chen · 当前余额 ¥128.40', { exact: true })).toBeVisible()
  await dialog.getByLabel('金额（元）').fill('12.5')
  await dialog.getByLabel('调账原因').fill('客户重复扣费补单处理')
  await expect(dialog.locator('[data-slot=adjust-summary]')).toHaveText('将给 lin_chen（ID 10482） 增加 ¥12.50，调账后余额 ¥140.90。')
  await dialog.getByRole('button', { name: '确认调账' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent).toEqual([{ user_id: 10482, type: 'recharge', credits: 12_500_000, reason: '客户重复扣费补单处理' }])

  // Taking money back: the same yuan figure goes out negative, and 4.35 is not bent by floating point.
  await page.getByRole('button', { name: '手动调账' }).click()
  const again = page.getByRole('dialog')
  await again.getByLabel('用户 ID').fill('10482')
  await expect(again.getByText('lin_chen · 当前余额 ¥128.40', { exact: true })).toBeVisible()
  await again.getByRole('combobox', { name: '操作类型' }).click()
  await page.getByRole('option', { name: '冲销（减少余额）' }).click()
  await again.getByLabel('金额（元）').fill('4.35')
  await again.getByLabel('调账原因').fill('冲销重复入账的一笔款项')
  await expect(again.locator('[data-slot=adjust-summary]')).toHaveText('将从 lin_chen（ID 10482） 扣减 ¥4.35，调账后余额 ¥124.05。')
  await again.getByRole('button', { name: '确认调账' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent[1]).toEqual({ user_id: 10482, type: 'adjust', credits: -4_350_000, reason: '冲销重复入账的一笔款项' })
  expect(sent).toHaveLength(2)
})

test('an adjustment that cannot be stated exactly is never sent', async ({ page }) => {
  const sent: Sent = []
  const dialog = await openAdjust(page, sent)
  const alert = dialog.getByRole('alert')
  const confirm = dialog.getByRole('button', { name: '确认调账' })
  const reason = '核对过的调账原因说明'

  // No such account.
  await dialog.getByLabel('用户 ID').fill('99999')
  await expect(dialog.getByText('没有 ID 为 99999 的用户。')).toBeVisible()
  await dialog.getByLabel('金额（元）').fill('1')
  await dialog.getByLabel('调账原因').fill(reason)
  await confirm.click()
  await expect(alert).toHaveText('没有 ID 为 99999 的用户。')

  // Zero, not a number, negative, or finer than the ledger holds.
  await dialog.getByLabel('用户 ID').fill('10482')
  await expect(dialog.getByText('lin_chen · 当前余额 ¥128.40', { exact: true })).toBeVisible()
  for (const bad of ['', '0', 'abc', '-5', '1e3', '0.0000001']) {
    await dialog.getByLabel('金额（元）').fill(bad)
    await confirm.click()
    await expect(alert).toHaveText('请填写金额：大于 0 的数字，最多 6 位小数。')
  }

  // Taking more than the account holds.
  await dialog.getByRole('combobox', { name: '操作类型' }).click()
  await page.getByRole('option', { name: '冲销（减少余额）' }).click()
  await dialog.getByLabel('金额（元）').fill('999')
  await confirm.click()
  await expect(alert).toHaveText('lin_chen（ID 10482） 的余额只有 ¥128.40，不够扣减 ¥999.00。')

  // A reason too short to audit.
  await dialog.getByLabel('金额（元）').fill('1')
  await dialog.getByLabel('调账原因').fill('太短了')
  await confirm.click()
  await expect(alert).toHaveText('调账原因至少 10 个字。')

  expect(sent).toEqual([])
})

/** The invite centre of a signed-in user with `frozen` micro-credits of frozen rebate. Every conversion the page sends lands in `sent`. */
async function openConvert(page: Page, sent: Sent, options: { frozen?: number; drop?: boolean } = {}) {
  const frozen = options.frozen ?? 36_426_789
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/user/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/user/balance') return route.fulfill(json({ balance_credits: 128_450_000 }))
    if (url.pathname === '/api/user/invite') return route.fulfill(json({ invite_code: 'ABC123', invite_count: 3, frozen_balance: frozen }))
    if (url.pathname === '/api/user/invite/convert') {
      const body = route.request().postDataJSON()
      sent.push(body)
      return options.drop ? route.abort('connectionreset') : route.fulfill(json({ converted: body.amount, available_balance: 0 }))
    }
    return route.fulfill(json({}))
  })
  await page.goto('/invite')
  await page.getByRole('button', { name: '解冻返佣' }).click()
  return page.getByRole('dialog')
}

test('frozen rebate is converted in exact micro-credits, and never as zero', async ({ page }) => {
  const sent: Sent = []
  const dialog = await openConvert(page, sent)
  await expect(dialog.getByText('36.426789 积分').first()).toBeVisible()
  const confirm = dialog.getByRole('button', { name: '确认解冻' })
  const alert = dialog.getByRole('alert')
  const amount = dialog.getByLabel('解冻数量')

  // Nothing readable, zero, or finer than the ledger holds: refused here. 0 is never sent, because the server reads it as everything.
  for (const bad of ['', '0', 'abc', '-1', '1e3', '1.1234567']) {
    await amount.fill(bad)
    await confirm.click()
    await expect(alert).toHaveText('请填写解冻数量：大于 0 的数字，最多 6 位小数。')
  }
  // More than is frozen.
  await amount.fill('36.5')
  await expect(dialog.locator('[data-slot=convert-summary]')).toHaveCount(0)
  await confirm.click()
  await expect(alert).toHaveText('冻结返佣只有 36.426789 积分，不够解冻 36.5 积分。')
  expect(sent).toEqual([])

  // Everything: the exact frozen figure, written out from the button and sent as written.
  await dialog.getByRole('button', { name: '全部解冻' }).click()
  await expect(amount).toHaveValue('36.426789')
  await expect(dialog.locator('[data-slot=convert-summary]')).toContainText('将把 36.426789 积分')
  await expect(dialog.locator('[data-slot=convert-summary]')).toContainText('冻结返佣剩 0.00 积分')
  await confirm.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent).toEqual([{ amount: 36_426_789 }])

  // A part of it: typed in credits, sent in micro-credits.
  await page.getByRole('button', { name: '解冻返佣' }).click()
  await page.getByRole('dialog').getByLabel('解冻数量').fill('4.35')
  await page.getByRole('dialog').getByRole('button', { name: '确认解冻' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent).toEqual([{ amount: 36_426_789 }, { amount: 4_350_000 }])
})

test('with nothing frozen the dialog cannot send anything', async ({ page }) => {
  const sent: Sent = []
  const dialog = await openConvert(page, sent, { frozen: 0 })
  await expect(dialog.getByRole('button', { name: '确认解冻' })).toBeDisabled()
  await expect(dialog.getByLabel('解冻数量')).toBeDisabled()
  expect(sent).toEqual([])
})

test('a dropped connection is not reported as a refusal', async ({ page }) => {
  const sent: Sent = []
  const dialog = await openConvert(page, sent, { drop: true })
  await dialog.getByLabel('解冻数量').fill('1')
  await dialog.getByRole('button', { name: '确认解冻' }).click()
  await expect(dialog.getByRole('alert')).toContainText('这次解冻可能已经生效')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(sent).toEqual([{ amount: 1_000_000 }])
})
