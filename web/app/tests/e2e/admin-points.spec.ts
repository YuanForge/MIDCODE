import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { pointsToCredits, deductionPayload } from '../../src/lib/admin-points'

async function setup(page: Page) {
  const state = { posts: [] as { path: string; body: Record<string, unknown> }[], fail: false, delay: false }
  await page.addInitScript(() => { localStorage.setItem('admin_token', 'mock-admin-token'); localStorage.setItem('MidCode_ui_mode', 'admin') })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (route.request().method() === 'POST') {
      state.posts.push({ path, body: route.request().postDataJSON() })
      if (state.delay) await new Promise(r => setTimeout(r, 700))
      return state.fail ? reply({ error: '模拟扣除失败，请重试' }, 500) : reply({ ok: true, balance_after: 9875000 })
    }
    if (path === '/api/admin/me') return reply({ id: 1, permissions: ['*'] })
    if (path === '/api/admin/users') return reply({ users: [{ id: 42, username: '测试用户', email: 'qa@example.invalid', balance: 10000000, is_active: true, role: 'user' }], total: 1 })
    if (path.endsWith('/referrals')) return reply({ referrals: [], total: 0 })
    if (path.endsWith('/transactions')) return reply({ transactions: [], total: 0, summary: {} })
    if (path.endsWith('/public/settings')) return reply({ settings: { site_name: 'MidCode' } })
    return reply({ groups: [], items: [], total: 0 })
  })
  return state
}

test('decimal conversion preserves precision and rejects unsafe inputs', () => {
  expect(pointsToCredits('0.000001')).toBe(1)
  expect(pointsToCredits('1.234567')).toBe(1234567)
  expect(pointsToCredits('9007199254.740991')).toBe(Number.MAX_SAFE_INTEGER)
  for (const value of ['0', '-1', '1e6', 'NaN', 'Infinity', '1.0000001', '9007199254.740992', '']) expect(() => pointsToCredits(value)).toThrow()
  expect(deductionPayload('42', '1.25', '人工核对后扣除测试积分')).toMatchObject({ user_id: 42, credits: -1250000, type: 'adjust' })
  for (const id of ['0', '-1', '1.1', '1e3', '9007199254740992']) expect(() => deductionPayload(id, '1', '人工核对后扣除测试积分')).toThrow()
  expect(() => deductionPayload('42', '1', '          ')).toThrow()
})

for (const mobile of [false, true]) test(`user deduction validates and sends once (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  const state = await setup(page)
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: '用户与余额管理' })).toBeVisible()
  await page.getByRole('button', { name: '扣除积分', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('扣除积分数').fill('0.125')
  await dialog.getByRole('button', { name: '确认扣除' }).click()
  await expect(dialog.getByText('扣除原因至少 10 个字符')).toBeVisible()
  expect(state.posts).toHaveLength(0)
  await dialog.getByLabel('扣除原因').fill('人工核对后扣除测试积分')
  await expect(dialog.getByText('将从用户 #42 扣除 0.125 积分。')).toBeVisible()
  await expect(dialog).not.toContainText('credits')
  await mkdir('test-results/credit-evidence', { recursive: true })
  await page.screenshot({ path: `test-results/credit-evidence/deduct-${mobile ? 'mobile' : 'desktop'}.png` })
  const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(mobile ? 391 : 1441)
  state.delay = true
  await dialog.getByRole('button', { name: '确认扣除' }).click()
  await expect(dialog.getByRole('button', { name: '提交中…' })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
  await expect(page.getByRole('status')).toContainText('已为用户 #42 扣除 0.125 积分')
  expect(state.posts).toEqual([{ path: '/api/admin/transactions/adjust', body: { user_id: 42, type: 'adjust', credits: -125000, reason: '人工核对后扣除测试积分' } }])
  expect(errors).toEqual([])
})

test('billing only offers deduction and retains inputs after API failure', async ({ page }) => {
  const state = await setup(page); state.fail = true
  await page.goto('/admin/billing')
  await page.getByRole('button', { name: '扣除积分', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).not.toContainText('增加余额')
  await dialog.getByLabel('用户 ID', { exact: true }).fill('42')
  await dialog.getByLabel('扣除积分数').fill('1.234567')
  await dialog.getByLabel('扣除原因').fill('人工核对后扣除测试积分')
  await dialog.getByRole('button', { name: '确认扣除' }).click()
  await expect(dialog.getByText('模拟扣除失败，请重试')).toBeVisible()
  expect(state.posts[0].body.credits).toBe(-1234567)
  await expect(dialog.getByLabel('扣除积分数')).toHaveValue('1.234567')
  state.fail = false
  await dialog.getByRole('button', { name: '确认扣除' }).click()
  await expect(page.getByRole('status')).toContainText('已为用户 #42 扣除 1.234567 积分')
})

test('recharge and model grants use display points without exposing internal units', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/admin/users')
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '充值', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('充值积分数').fill('0.000001')
  await expect(dialog).not.toContainText('credits')
  await expect(dialog).toContainText('将为用户 #42 充值 0.000001 积分')
  await dialog.getByRole('button', { name: '确认充值' }).click()
  await expect(page.getByRole('status')).toContainText('充值 0.000001 积分')
  expect(state.posts[0]).toEqual({ path: '/api/admin/users/42/recharge', body: { amount: 1 } })
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '赠积分', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('模型名称', { exact: true }).fill('claude-opus-5-5')
  await dialog.getByLabel('赠送积分数').fill('1.234567')
  await expect(dialog).not.toContainText('credits')
  await dialog.getByRole('button', { name: '确认赠送' }).click()
  await expect(page.getByRole('status')).toContainText('赠送 1.234567 积分')
  expect(state.posts[1]).toEqual({ path: '/api/admin/users/42/model-credits', body: { model_name: 'claude-opus-5-5', credits: 1234567 } })
})
