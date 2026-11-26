import { expect, test } from '@playwright/test'

test('manages provider lifecycle and keeps referenced providers protected on mobile', async ({ page }, testInfo) => {
  let providers = [
    { id: 1, code: 'openai', name: 'OpenAI', is_active: true, sort_order: 10, group_count: 2, channel_count: 3 },
  ]
  let disabledPayload: Record<string, unknown> | undefined

  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })
  await page.route('**/api/public/settings', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }) }),
  )
  await page.route('**/api/admin/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, username: 'admin', role: 'admin' }) }),
  )
  await page.route('**/api/admin/model-providers**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const payload = request.postDataJSON() as Record<string, unknown> | null
    if (request.method() === 'POST') {
      providers = [...providers, { id: 2, code: String(payload?.code), name: String(payload?.name), is_active: true, sort_order: Number(payload?.sort_order), group_count: 0, channel_count: 0 }]
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(providers[1]) })
      return
    }
    if (pathname.endsWith('/2') && request.method() === 'PUT') {
      providers = providers.map((provider) => provider.id === 2 ? { ...provider, name: String(payload?.name), sort_order: Number(payload?.sort_order) } : provider)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(providers[1]) })
      return
    }
    if (pathname.endsWith('/1/toggle') && request.method() === 'PATCH') {
      disabledPayload = payload ?? undefined
      providers = providers.map((provider) => provider.id === 1 ? { ...provider, is_active: false } : provider)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: providers.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) }) })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/model-providers')
  await page.getByRole('button', { name: '新建企业' }).click()
  await page.getByLabel('企业编码').fill('anthropic')
  await page.getByLabel('显示名称').fill('Anthropic')
  await page.getByLabel('排序').fill('5')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Anthropic' })).toBeVisible()

  await page.getByRole('button', { name: '编辑 Anthropic' }).click()
  await page.getByLabel('显示名称').fill('Anthropic Enterprise')
  await page.getByLabel('排序').fill('1')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Anthropic Enterprise')

  const openAIRow = page.getByRole('row').filter({ hasText: 'OpenAI' })
  await expect(openAIRow.getByRole('button', { name: '删除 OpenAI' })).toBeDisabled()
  await openAIRow.getByRole('button', { name: '停用 OpenAI' }).click()
  await expect(page.getByText(/该企业关联 2 个分组和 3 个渠道/)).toBeVisible()
  await expect(page.getByText(/新请求将立即停止使用该企业/)).toBeVisible()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => disabledPayload).toEqual({ is_active: false })
  await expect(openAIRow.getByText('停用', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('model-providers-desktop.png'), fullPage: false })

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const mobileDeleteButton = openAIRow.getByRole('button', { name: '删除 OpenAI' })
  const mobileDeleteBox = await mobileDeleteButton.boundingBox()
  expect((mobileDeleteBox?.x ?? 1000) + (mobileDeleteBox?.width ?? 1000)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('model-providers-mobile.png'), fullPage: false })
})
