import { expect, test } from '@playwright/test'

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

const rows = [
  { id: 11, model: 'gpt-5-mini', status: 'ok', corr_id: 'req-ok-11', created_at: '2026-11-25T14:37:26+08:00', credits_charged: 12000, latency_ms: 12000, usage: { prompt_tokens: 1024, completion_tokens: 256 } },
  { id: 12, model: 'deepseek-reasoner', status: 'error', corr_id: 'req-fail-12', created_at: '2026-11-25T14:28:50+08:00', credits_charged: 0, latency_ms: 65000, error_msg: '上游返回 429：请求过于频繁' },
  // Still running: the server sends no duration for it.
  { id: 13, model: 'claude-sonnet-4', status: 'pending', corr_id: 'req-pending-13', created_at: '2026-11-25T14:40:02+08:00', credits_charged: 0 },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/public/settings', (route) => route.fulfill(json({ settings: { site_name: 'MidCode', logo_url: '' } })))
  await page.route('**/api/user/balance', (route) => route.fulfill(json({ balance_credits: 128450000 })))
  await page.route('**/api/user/apikeys', (route) => route.fulfill(json({ api_keys: [] })))
  await page.route('**/v1/llm-logs?**', (route) => route.fulfill(json({ logs: rows, total: rows.length })))
  await page.route('**/v1/llm-logs/11', (route) => route.fulfill(json({ ...rows[0], client_request: { model: 'gpt-5-mini' } })))
  await page.route('**/v1/llm-logs/12', (route) => route.fulfill(json({ ...rows[1], client_response: { error: { code: '429' } } })))
})

test('a call opens beside the table on a wide window and says why it failed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/llm-logs')

  const table = page.getByRole('table')
  await expect(table.getByText('deepseek-reasoner')).toBeVisible()
  // Closed: the full table, with its token and price columns.
  await expect(table.getByRole('columnheader', { name: '输入价格' })).toBeVisible()
  // How long each call took, in the units the server can vouch for. A call that has not ended shows no duration.
  await expect(table.getByRole('columnheader', { name: '耗时' })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'gpt-5-mini' }).getByText('约 12 秒')).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'deepseek-reasoner' }).getByText('约 1 分 5 秒')).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'claude-sonnet-4' }).getByText(/约|不到/)).toHaveCount(0)

  await table.getByText('deepseek-reasoner').click()
  const panel = page.getByRole('complementary', { name: '日志详情' })
  await expect(panel).toBeVisible()
  // No drawer on a wide window: the detail sits in the page, to the right of the table.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const [tableBox, panelBox] = [await table.boundingBox(), await panel.boundingBox()]
  expect(panelBox?.x ?? 0).toBeGreaterThan((tableBox?.x ?? 0) + (tableBox?.width ?? 0) - 1)

  // The reason comes first, with whether the call was charged.
  await expect(panel.getByText('上游返回 429：请求过于频繁')).toBeVisible()
  await expect(panel.getByText('这次调用没有扣费。')).toBeVisible()
  await expect(panel.getByText('req-fail-12')).toBeVisible()
  await expect(panel.getByText('约 1 分 5 秒')).toBeVisible()

  // With the detail open the table keeps the columns people scan by and does not scroll sideways.
  await expect(table.getByRole('columnheader', { name: '输入价格' })).toBeHidden()
  await expect(table.getByRole('columnheader', { name: '耗时' })).toBeHidden()
  await expect(table.getByRole('columnheader', { name: '状态' })).toBeVisible()
  const overflow = await table.evaluate((node) => (node.parentElement?.scrollWidth ?? 0) - (node.parentElement?.clientWidth ?? 0))
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(table.getByRole('row').filter({ hasText: 'deepseek-reasoner' })).toHaveAttribute('data-state', 'selected')

  // Going to the next row swaps the detail in place.
  await table.getByText('gpt-5-mini').click()
  await expect(panel.getByText('req-ok-11')).toBeVisible()
  await expect(panel.getByText('约 12 秒')).toBeVisible()
  await expect(panel.getByText('这次调用没有扣费。')).toHaveCount(0)

  // Escape closes it and the full table comes back.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(table.getByRole('columnheader', { name: '输入价格' })).toBeVisible()
})

test('on a narrow window the same detail opens in a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('/llm-logs')

  await page.getByRole('table').getByText('deepseek-reasoner').click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('上游返回 429：请求过于频繁')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '日志详情' })).toHaveCount(0)
})
