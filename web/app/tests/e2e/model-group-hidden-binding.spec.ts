import { expect, test } from '@playwright/test'

test('shows saved bindings whose routing model differs from the current channel model', async ({ page }) => {
  const channel = {
    id: 155,
    name: 'https://zzshu.cc/claude-sonnet-5-max3',
    model: 'claude-sonnet-5',
    display_name: 'claude-sonnet-5',
    model_provider_id: 1,
    is_active: true,
  }

  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })

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
  await page.route('**/api/admin/channels**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ channels: [channel] }),
  }))
  await page.route('**/api/admin/model-providers**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ providers: [{ id: 1, code: 'anthropic', name: 'Anthropic', is_active: true }] }),
  }))
  await page.route('**/api/admin/model-groups**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/7/models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [{ id: 70, group_id: 7, routing_model: 'claude-sonnet-5-cc', channel_id: 155, channel }],
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groups: [{ id: 7, code: 'claude-cc', name: 'Claude CC', model_provider_id: 1, model_provider: 'Anthropic', is_active: true, model_count: 1 }],
      }),
    })
  })

  await page.goto('/admin/model-groups')
  await page.getByRole('row').filter({ hasText: 'claude-cc' }).click()

  const historicalRow = page.getByRole('row').filter({
    has: page.getByText('claude-sonnet-5-cc', { exact: true }),
  })
  const currentRow = page.getByRole('row').filter({
    has: page.getByText('claude-sonnet-5', { exact: true }),
  })

  await expect(page.getByText('已选 1 / 2', { exact: true })).toBeVisible()
  await expect(historicalRow).toHaveCount(1)
  await expect(historicalRow.getByRole('checkbox')).toBeChecked()
  await expect(currentRow.getByRole('checkbox')).not.toBeChecked()

  await historicalRow.getByRole('checkbox').click()
  await expect(page.getByText('已选 0 / 2', { exact: true })).toBeVisible()
})
