import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page, authenticated = true) {
  const calls: string[] = []
  await page.addInitScript(auth => {
    localStorage.setItem('fanapi_language', 'zh-CN')
    if (auth) { localStorage.setItem('token', 'fixture'); localStorage.setItem('admin_token', 'fixture-admin') }
  }, authenticated)
  await page.route('**/env.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.__FANAPI_ENV__={site_name:"MidCode"}' }))
  await page.route('**/api/**', r => {
    const u = new URL(r.request().url()); calls.push(u.pathname + u.search)
    const send = (body: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    if (u.pathname.endsWith('/apikeys')) return send({ api_keys: [1, 8].map((count, i) => ({
      id: i + 1, name: `key-${count}`, viewable: true, raw_key: 'fixture-key-' + count, is_active: true,
      model_groups: Array.from({ length: count }, (_, j) => ({ group_id: j + 1, priority: j, group: { name: '分组名称-' + j, model_provider: 'OpenAI' } })),
    })) })
    if (u.pathname.endsWith('/profile')) return send({ id: 3, username: 'fixture', role: 'user' })
    if (u.pathname.endsWith('/me')) return send({ user_id: 1, role: 'root', permissions: ['*'] })
    if (u.pathname.endsWith('/channels')) return send({ channels: [{ id: 1, type: 'llm', name: 'gpt-image-2', routing_model: 'gpt-image-2', model_provider: 'OpenAI', protocol: 'openai', billing_type: 'token' }] })
    if (u.pathname.endsWith('/auth/login')) return send({ token: 'logged-in', user: { id: 3 } })
    if (u.pathname.endsWith('/model-preferences')) return send({ preferences: [] })
    return send({ cards: [], total: 0, groups: [], batches: [], vendors: [], permissions: ['*'] })
  })
  return calls
}

test('key rows keep height and expose group tooltip and CC Switch models', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await setup(page); await page.goto('/keys')
  const one = page.getByRole('row').filter({ hasText: 'key-1' }), many = page.getByRole('row').filter({ hasText: 'key-8' })
  await expect(many.getByText('+7', { exact: true })).toBeVisible()
  expect((await one.boundingBox())!.height).toBe((await many.boundingBox())!.height)
  await many.getByRole('button', { name: '查看全部 8 个模型分组及优先顺序' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('分组名称-7')
  await page.mouse.move(0, 0)
  await many.getByRole('button', { name: '导入 CC Switch', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入 CC Switch', exact: true })
  await expect(dialog).toContainText('当前密钥：key-8')
  await dialog.getByLabel('客户端').selectOption('codex')
  await expect(dialog.getByLabel('模型名称')).toHaveValue('gpt-image-2')
  await expect(dialog.getByRole('button', { name: '打开 CC Switch 导入' })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('cc-switch-desktop.png') })
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 844 })
  expect((await one.boundingBox())!.height).toBe((await many.boundingBox())!.height)
  await page.screenshot({ path: info.outputPath('keys-mobile.png') }); expect(errors).toEqual([])
})

test('guest dialogs preserve route and login restores keys', async ({ page }, info) => {
  await setup(page, false); await page.goto('/keys')
  await expect(page.getByText('登录后使用此功能')).toBeVisible()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('dialog').getByText('立即注册', { exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('邮箱', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('dialog').getByText('忘记密码？', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: '找回密码' })).toBeVisible()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '登录用户端' })
  await dialog.locator('#user-login-username').fill('fixture'); await dialog.locator('#user-login-password').fill('fixture-password')
  await dialog.getByRole('checkbox', { name: '用户协议', exact: true }).check()
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('key-8', { exact: true })).toBeVisible(); await expect(page).toHaveURL(/\/keys$/)
  await page.screenshot({ path: info.outputPath('restored-session.png') })
})

test('redemption filters send user and email to server', async ({ page }) => {
  const calls = await setup(page); await page.goto('/admin/cards')
  await page.getByRole('tab', { name: /使用记录|兑换记录/ }).click()
  await page.getByLabel('兑换用户 ID').fill('123'); await page.getByLabel('兑换用户邮箱').fill('fixture@example.invalid')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect.poll(() => calls.some(x => x.includes('used_by=123') && x.includes('used_email=fixture%40example.invalid'))).toBe(true)
})

test('guest image documentation does not request private statistics', async ({ page }) => {
  const calls = await setup(page, false); await page.goto('/models')
  await page.locator('[data-model="gpt-image-2"]').click()
  await expect(page.getByRole('heading', { name: '图片编辑 · 接口格式参考' })).toBeVisible()
  expect(calls.some(x => x.includes('/user/model-availability'))).toBe(false)
})
