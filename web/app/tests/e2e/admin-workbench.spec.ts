import { expect, test, type Page } from '@playwright/test'

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('admin_token', 'mock-admin-token'))
  await page.route('**/api/public/settings', (route) => route.fulfill(json({ settings: { site_name: 'MidCode', logo_url: '' } })))
  await page.route('**/api/admin/me', (route) => route.fulfill(json({ permissions: ['*'] })))
})

/** The two summaries the workbench reads beside the withdrawal count. Answered as empty unless a test says otherwise. */
async function quietSummaries(page: Page) {
  await page.route('**/api/admin/stats/channel-health**', (route) => route.fulfill(json({ window_minutes: 60, channels: [] })))
  await page.route('**/api/admin/stats/key-pools', (route) => route.fulfill(json({ pools: [] })))
}

test('the workbench leads with what is waiting, and never shows an unknown count as none', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/admin/stats', (route) => route.fulfill(json({})))
  await quietSummaries(page)
  await page.route('**/api/admin/withdrawals/pending-count', (route) => route.fulfill(json({ count: 3 })))
  await page.goto('/admin/dashboard')

  const pending = page.getByRole('region', { name: '待处理' })
  await expect(pending.getByText('待审核提现')).toBeVisible()
  await expect(pending.getByText('3', { exact: true })).toBeVisible()
  await expect(pending.getByRole('link', { name: '去审核' })).toHaveAttribute('href', '/admin/withdraw')
  // An older server sends the count alone: the row still stands, without a total it was not given.
  await expect(pending.getByText('等待客服初审或财务复审。')).toBeVisible()
  // Sources with nothing waiting take no row.
  await expect(pending.getByRole('listitem')).toHaveCount(1)

  // A read that fails keeps its row and says so. It is not shown as nothing waiting.
  await page.route('**/api/admin/withdrawals/pending-count', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }))
  await page.reload()
  await expect(pending.getByText('加载失败')).toBeVisible()
  await expect(pending.getByText('现在没有需要处理的事。')).toHaveCount(0)

  // Only a count the server really sent as zero reads as nothing waiting.
  await page.route('**/api/admin/withdrawals/pending-count', (route) => route.fulfill(json({ count: 0 })))
  await page.reload()
  await expect(pending.getByText('现在没有需要处理的事。')).toBeVisible()

  // A summary that answers without its list was not read: that is unknown too, not an empty list.
  await page.route('**/api/admin/stats/key-pools', (route) => route.fulfill(json({})))
  await page.reload()
  await expect(pending.getByText('号池余量低')).toBeVisible()
  await expect(pending.getByText('加载失败')).toBeVisible()
  await expect(pending.getByText('现在没有需要处理的事。')).toHaveCount(0)
})

test('failing channels and key pools running dry come first, each by the rule its row states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/admin/stats', (route) => route.fulfill(json({})))
  const windows: Array<string | null> = []
  await page.route('**/api/admin/stats/channel-health**', (route) => {
    windows.push(new URL(route.request().url()).searchParams.get('window_minutes'))
    return route.fulfill(
      json({
        window_minutes: 60,
        channels: [
          { channel_id: 4, name: '健康渠道', is_active: true, total: 200, failed: 6, failure_rate: 3, p50_ms: 5000 },
          { channel_id: 1, name: 'OpenAI 主线路', is_active: true, total: 40, failed: 14, failure_rate: 35, p50_ms: 8000 },
          // All four of its calls failed, but four calls say too little to raise a flag.
          { channel_id: 2, name: '安静渠道', is_active: true, total: 4, failed: 4, failure_rate: 100, p50_ms: 0 },
          // Already switched off: there is nothing left to do about it.
          { channel_id: 3, name: '已停用渠道', is_active: false, total: 50, failed: 50, failure_rate: 100, p50_ms: 0 },
        ],
      }),
    )
  })
  await page.route('**/api/admin/stats/key-pools', (route) =>
    route.fulfill(
      json({
        pools: [
          { id: 1, name: 'Anthropic 官方号池', is_active: true, total_keys: 9, active_keys: 2, channels_in_use: 3 },
          { id: 2, name: '企业专线', is_active: true, total_keys: 0, active_keys: 0, channels_in_use: 2 },
          // No active channel draws from it.
          { id: 3, name: '闲置号池', is_active: true, total_keys: 1, active_keys: 1, channels_in_use: 0 },
          { id: 4, name: '已停用号池', is_active: false, total_keys: 2, active_keys: 0, channels_in_use: 1 },
          { id: 5, name: '充足号池', is_active: true, total_keys: 8, active_keys: 7, channels_in_use: 6 },
        ],
      }),
    ),
  )
  const oldest = new Date(Date.now() - (26 * 60 + 20) * 60_000).toISOString()
  await page.route('**/api/admin/withdrawals/pending-count', (route) => route.fulfill(json({ count: 3, total_amount: 39_500_000, oldest_at: oldest })))
  await page.goto('/admin/dashboard')

  const pending = page.getByRole('region', { name: '待处理' })
  const rows = pending.getByRole('listitem')
  await expect(rows).toHaveCount(3)
  expect(windows[0]).toBe('60')

  // By urgency: what is failing now, then what is about to run out, then people waiting for money.
  await expect(rows.nth(0)).toContainText('渠道异常')
  await expect(rows.nth(0).getByText('1', { exact: true })).toBeVisible()
  await expect(rows.nth(0)).toContainText('近 60 分钟失败率不低于 20%：「OpenAI 主线路」35%（40 次中 14 次失败）。')
  await expect(rows.nth(0).getByRole('link', { name: '去查看' })).toHaveAttribute('href', '/admin/channels')

  await expect(rows.nth(1)).toContainText('号池余量低')
  await expect(rows.nth(1).getByText('2', { exact: true })).toBeVisible()
  // The emptiest pool is named first.
  await expect(rows.nth(1)).toContainText('可用 Key 少于 3 个的在用号池：「企业专线」已没有可用 Key、「Anthropic 官方号池」剩 2 个。')
  await expect(rows.nth(1).getByRole('link', { name: '去补充' })).toHaveAttribute('href', '/admin/key-pools')

  await expect(rows.nth(2)).toContainText('待审核提现')
  await expect(rows.nth(2)).toContainText('合计 ¥39.50，最早一笔已等待 1 天 2 小时。')

  for (const quiet of ['健康渠道', '安静渠道', '已停用渠道', '闲置号池', '已停用号池', '充足号池']) {
    await expect(pending.getByText(quiet)).toHaveCount(0)
  }
})

test('a name is set off in brackets and cut when it runs to a sentence, and a large total is grouped', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/admin/stats', (route) => route.fulfill(json({})))
  const longName = '企业专线专用号池 · 仅限华东二区私有化部署渠道使用 · 请勿与公共渠道混用'
  await page.route('**/api/admin/stats/channel-health**', (route) => route.fulfill(json({ window_minutes: 60, channels: [] })))
  await page.route('**/api/admin/stats/key-pools', (route) =>
    route.fulfill(json({ pools: [{ id: 1, name: longName, is_active: true, total_keys: 0, active_keys: 0, channels_in_use: 2 }] })),
  )
  await page.route('**/api/admin/withdrawals/pending-count', (route) => route.fulfill(json({ count: 10, total_amount: 15_362_500_000 })))
  await page.goto('/admin/dashboard')

  const pending = page.getByRole('region', { name: '待处理' })
  // The name is cut at 24 characters and closed with a bracket, so the words after it cannot read as part of it.
  await expect(pending).toContainText(`「${Array.from(longName).slice(0, 24).join('')}…」已没有可用 Key`)
  await expect(pending).not.toContainText(longName)
  await expect(pending).toContainText('合计 ¥15,362.50')
})

test('a source is neither requested nor listed for an admin who cannot open its page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/admin/me', (route) => route.fulfill(json({ permissions: ['withdraw:read'] })))
  await page.route('**/api/admin/stats', (route) => route.fulfill(json({})))
  const asked: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/admin/stats/')) asked.push(path)
  })
  await page.route('**/api/admin/withdrawals/pending-count', (route) => route.fulfill(json({ count: 5, total_amount: 1_000_000 })))
  await page.goto('/admin/dashboard')

  const pending = page.getByRole('region', { name: '待处理' })
  await expect(pending.getByText('待审核提现')).toBeVisible()
  // A total without the oldest request still reads as a sentence.
  await expect(pending.getByText('合计 ¥1.00，等待客服初审或财务复审。')).toBeVisible()
  await expect(pending.getByRole('listitem')).toHaveCount(1)
  expect(asked.filter((path) => path.endsWith('/channel-health') || path.endsWith('/key-pools'))).toEqual([])
})

test('today reads as calls, failures and sign-ups, and a figure the server left out is not a zero', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await quietSummaries(page)
  await page.route('**/api/admin/withdrawals/pending-count', (route) => route.fulfill(json({ count: 0 })))
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill(json({ users: 120, channels: 12, active_channels: 9, today: { revenue: 3_800_000, cost: 2_700_000, profit: 1_100_000, count: 8, calls: 482, failed_calls: 9, new_users: 17 } })),
  )
  await page.goto('/admin/dashboard')

  const cell = (label: string) => page.locator('[data-slot="stat-strip"] > div').filter({ has: page.getByText(label, { exact: true }) })
  await expect(cell('今日调用').getByText('482', { exact: true })).toBeVisible()
  await expect(cell('今日失败率').getByText('1.87%', { exact: true })).toBeVisible()
  await expect(cell('今日失败率').getByText('失败 9 次')).toBeVisible()
  await expect(cell('今日新注册').getByText('17', { exact: true })).toBeVisible()

  // No calls yet today: a count of zero, and no rate, because a share of nothing is not 0%.
  await page.route('**/api/admin/stats', (route) => route.fulfill(json({ today: { calls: 0, failed_calls: 0, new_users: 0 } })))
  await page.reload()
  await expect(cell('今日调用').getByText('0', { exact: true })).toBeVisible()
  await expect(cell('今日失败率').getByText('--', { exact: true })).toBeVisible()
  await expect(cell('今日失败率').getByText('今日还没有调用')).toBeVisible()
  await expect(cell('今日新注册').getByText('0', { exact: true })).toBeVisible()

  // An older server sends none of the three: each shows as unknown.
  await page.route('**/api/admin/stats', (route) => route.fulfill(json({ today: { revenue: 0, cost: 0, profit: 0, count: 0 } })))
  await page.reload()
  for (const label of ['今日调用', '今日失败率', '今日新注册']) {
    await expect(cell(label).getByText('--', { exact: true })).toBeVisible()
  }
})

test('an account opens beside the user table on a wide window, and in a dialog below that', async ({ page }) => {
  const users = [
    { id: 10482, username: 'lin_chen', email: 'lin.chen@example.com', is_active: true, balance: 128400000, created_at: '2026-11-21T09:00:00+08:00' },
    { id: 10477, username: 'studio_wu', email: 'wu@studio.example', is_active: true, balance: 12860000000, created_at: '2026-11-19T09:00:00+08:00' },
  ]
  await page.route('**/api/admin/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/admin/me') return route.fulfill(json({ permissions: ['*'] }))
    if (path === '/api/admin/users') return route.fulfill(json({ users, total: users.length }))
    return route.fulfill(json({}))
  })
  await page.setViewportSize({ width: 1760, height: 950 })
  await page.goto('/admin/users')

  const table = page.getByRole('table').first()
  const row = table.getByRole('row').filter({ hasText: 'lin_chen' })
  await expect(table.getByRole('columnheader', { name: '邮箱' })).toBeVisible()
  await row.locator('[data-row-open]').click()

  const panel = page.getByRole('complementary', { name: '用户详情' })
  await expect(panel).toBeVisible()
  // The id is in the panel head, next to its copy button, and again among the account's facts.
  await expect(panel.getByRole('heading', { name: 'lin_chen' })).toBeVisible()
  await expect(panel.getByText('10482').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The table gives up the columns the panel shows, and marks the open row.
  await expect(table.getByRole('columnheader', { name: '邮箱' })).toHaveCount(0)
  await expect(row).toHaveAttribute('data-state', 'selected')
  const overflow = await table.evaluate((node) => (node.parentElement?.scrollWidth ?? 0) - (node.parentElement?.clientWidth ?? 0))
  expect(overflow).toBeLessThanOrEqual(0)

  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(table.getByRole('columnheader', { name: '邮箱' })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await row.locator('[data-row-open]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '用户详情' })).toHaveCount(0)
})
