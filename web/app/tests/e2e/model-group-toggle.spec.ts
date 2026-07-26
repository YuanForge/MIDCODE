import { expect, test } from '@playwright/test'

test('disables and re-enables a model group without stale form state', async ({ page }) => {
  let isActive = true
  let togglePayload: Record<string, unknown> | undefined
  let updatePayload: Record<string, unknown> | undefined
  let disableConfirmations = 0

  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })

  await page.route('**/api/public/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }),
    })
  })

  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, username: 'admin', role: 'admin' }),
    })
  })

  await page.route('**/api/admin/channels**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ channels: [] }),
    })
  })

  await page.route('**/api/admin/model-groups**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (pathname.endsWith('/1/models')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) })
      return
    }

    if (pathname.endsWith('/1/toggle') && request.method() === 'PATCH') {
      togglePayload = request.postDataJSON() as Record<string, unknown>
      isActive = togglePayload.is_active === true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    if (pathname.endsWith('/1') && request.method() === 'PUT') {
      updatePayload = request.postDataJSON() as Record<string, unknown>
      isActive = updatePayload.is_active === true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, ...updatePayload }) })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groups: [
          { id: 1, code: 'gpt-image-2', name: 'gpt-image-2', model_provider: 'OpenAI', description: '', is_active: isActive, model_count: 2 },
          { id: 2, code: 'gpt-enterprise', name: 'gpt-企业版', model_provider: 'OpenAI', description: '', is_active: true, model_count: 2 },
        ],
      }),
    })
  })

  page.on('dialog', async (dialog) => {
    disableConfirmations += 1
    expect(dialog.message()).toContain('停用后新请求将立即停止使用该分组')
    await dialog.accept()
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/model-groups')
  const groupRow = page.getByRole('row').filter({ hasText: 'gpt-image-2' })
  const groupTable = page.locator('main table').first()
  const tableOverflow = await groupTable.evaluate((table) => {
    const container = table.parentElement
    return (container?.scrollWidth ?? 0) - (container?.clientWidth ?? 0)
  })
  expect(tableOverflow).toBeLessThanOrEqual(0)
  await groupRow.click()

  await groupRow.getByRole('button', { name: '停用', exact: true }).click()
  await expect.poll(() => togglePayload).toEqual({ is_active: false })
  await expect(groupRow.getByText('停用', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '保存修改' }).click()
  await expect.poll(() => updatePayload?.is_active).toBe(false)

  await groupRow.getByRole('button', { name: '启用', exact: true }).click()
  await expect.poll(() => togglePayload).toEqual({ is_active: true })
  await expect(groupRow.getByText('启用', { exact: true })).toBeVisible()
  expect(disableConfirmations).toBe(1)
})
