import { expect, test, type Page } from '@playwright/test'

type MutationRecord = {
  method: string
  id?: number
  payload?: Record<string, unknown>
}

async function installOfficialPriceRouteMocks(page: Page) {
  const records: MutationRecord[] = []
  let prices = [
    {
      id: 1,
      model_provider_id: 1,
      model_provider_code: 'openai',
      model_provider_name: 'OpenAI',
      model_name: 'gpt-5',
      billing_type: 'token',
      currency: 'USD',
      source_price_config: { input_price_per_1m_tokens: '1.25', output_price_per_1m_tokens: '10' },
      normalized_price_config: { input_price_per_1m_tokens: 8430500, output_price_per_1m_tokens: 67444000 },
      exchange_rate_used: '6.7444',
      exchange_rate_date: '2026-08-09',
      is_active: true,
      updated_at: '2026-08-09T12:00:00Z',
    },
  ]

  await page.route('**/api/public/settings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }),
  }))
  await page.route('**/api/admin/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 1, username: 'admin', role: 'admin' }),
  }))
  await page.route('**/api/admin/settings/logs', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ logs: [] }),
  }))
  await page.route('**/api/admin/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { site_name: 'MidCode', theme_color: '#0f766e' } }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route('**/api/admin/model-providers**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ providers: [
      { id: 1, code: 'openai', name: 'OpenAI', is_active: true },
      { id: 2, code: 'qwen', name: '通义千问', is_active: true },
    ] }),
  }))
  await page.route('**/api/admin/model-official-prices**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const match = url.pathname.match(/model-official-prices\/(\d+)/)
    const id = match ? Number(match[1]) : undefined
    const payload = request.postDataJSON() as Record<string, unknown> | null

    if (request.method() === 'POST') {
      records.push({ method: 'POST', payload: payload ?? undefined })
      const created = {
        id: 2,
        ...payload,
        model_provider_code: 'qwen',
        model_provider_name: '通义千问',
        normalized_price_config: { price_per_call: 1686100 },
        is_active: true,
        updated_at: '2026-08-09T13:00:00Z',
      }
      prices = [...prices, created as typeof prices[number]]
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
      return
    }
    if (request.method() === 'PUT' && id) {
      records.push({ method: 'PUT', id, payload: payload ?? undefined })
      prices = prices.map((price) => price.id === id ? { ...price, ...payload, updated_at: '2026-08-09T14:00:00Z' } as typeof price : price)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(prices.find((price) => price.id === id)) })
      return
    }
    if (request.method() === 'PATCH' && id) {
      records.push({ method: 'PATCH', id, payload: payload ?? undefined })
      prices = prices.map((price) => price.id === id ? { ...price, is_active: Boolean(payload?.is_active) } : price)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(prices.find((price) => price.id === id)) })
      return
    }
    if (request.method() === 'DELETE' && id) {
      records.push({ method: 'DELETE', id })
      prices = prices.filter((price) => price.id !== id)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
      return
    }

    const providerID = url.searchParams.get('model_provider_id')
    const billingType = url.searchParams.get('billing_type')
    const active = url.searchParams.get('is_active')
    const modelName = url.searchParams.get('model_name')?.toLowerCase()
    records.push({ method: 'GET', payload: Object.fromEntries(url.searchParams) })
    const filtered = prices.filter((price) =>
      (!providerID || price.model_provider_id === Number(providerID)) &&
      (!billingType || price.billing_type === billingType) &&
      (!active || String(price.is_active) === active) &&
      (!modelName || price.model_name.toLowerCase().includes(modelName)),
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prices: filtered,
        total: filtered.length,
        exchange_rate: {
          value: '6.7444', source: 'frankfurter', date: '2026-08-09', synced_at: '2026-08-09T12:00:00Z',
          last_attempt_at: '2026-08-09T12:00:00Z', last_error: '', available: true,
        },
      }),
    })
  })

  return { records }
}

test('manages official prices and keeps dialog actions reachable', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('admin_token', 'mock-admin-token')
    localStorage.setItem('MidCode_ui_mode', 'admin')
  })
  const mocks = await installOfficialPriceRouteMocks(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/admin/settings')
  await page.getByRole('tab', { name: '官方价' }).click()
  await expect(page.getByText('Frankfurter')).toBeVisible()

  await page.getByRole('button', { name: '新增官方价' }).click()
  const createDialog = page.getByRole('dialog', { name: '新增官方价' })
  const save = createDialog.getByRole('button', { name: '保存', exact: true })
  await createDialog.getByLabel('计费类型').selectOption('image')
  await expect(createDialog.getByLabel('4K 价格')).toBeVisible()
  await expect(save).toBeVisible()
  const saveBox = await save.boundingBox()
  expect((saveBox?.y ?? 9999) + (saveBox?.height ?? 0)).toBeLessThanOrEqual(720)
  await createDialog.getByLabel('模型厂商').selectOption('2')
  await createDialog.getByLabel('标准模型名').fill('qwen-max')
  await createDialog.getByLabel('计费类型').selectOption('count')
  await createDialog.getByLabel('币种').selectOption('CNY')
  await createDialog.getByLabel('每次价格').fill('1.6861')
  await save.click()
  await expect.poll(() => mocks.records.find((record) => record.method === 'POST')?.payload).toMatchObject({
    model_provider_id: 2,
    model_name: 'qwen-max',
    billing_type: 'count',
    currency: 'CNY',
    source_price_config: { price_per_call: '1.6861' },
  })

  const qwenRow = page.getByRole('row').filter({ hasText: 'qwen-max' })
  await expect(qwenRow).toBeVisible()
  await qwenRow.getByRole('button', { name: '编辑 qwen-max' }).click()
  const editDialog = page.getByRole('dialog', { name: '编辑官方价' })
  await editDialog.getByLabel('标准模型名').fill('qwen-max-latest')
  await editDialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => mocks.records.find((record) => record.method === 'PUT')?.payload?.model_name).toBe('qwen-max-latest')

  const updatedRow = page.getByRole('row').filter({ hasText: 'qwen-max-latest' })
  await updatedRow.getByRole('button', { name: '停用 qwen-max-latest' }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => mocks.records.find((record) => record.method === 'PATCH')?.payload).toEqual({ is_active: false })

  await page.getByLabel('模型名称筛选').fill('gpt-5')
  await page.getByRole('button', { name: '查询' }).click()
  await expect.poll(() => mocks.records.filter((record) => record.method === 'GET').at(-1)?.payload).toMatchObject({ model_name: 'gpt-5' })
  await page.getByLabel('模型名称筛选').fill('')
  await page.getByRole('button', { name: '查询' }).click()

  const disabledRow = page.getByRole('row').filter({ hasText: 'qwen-max-latest' })
  await disabledRow.getByRole('button', { name: '删除 qwen-max-latest' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect.poll(() => mocks.records.some((record) => record.method === 'DELETE' && record.id === 2)).toBe(true)
  await expect(disabledRow).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 })

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.screenshot({ path: testInfo.outputPath('official-prices-desktop.png'), fullPage: false })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: testInfo.outputPath('official-prices-mobile.png'), fullPage: false })
})
