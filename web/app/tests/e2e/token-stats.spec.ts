import { expect, test } from '@playwright/test'

test('keeps channel Token statistics isolated by channel id', async ({ page }) => {
  let requestedChannelId = ''
  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })
  await page.route('**/api/public/settings', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { site_name: 'MidCode' } }) })
  })
  await page.route('**/api/admin/channels**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: [
          { id: 94, name: 'Sol A', model: 'gpt-5.6-sol', routing_model: 'gpt-5.6-sol', type: 'llm', protocol: 'responses', is_active: true },
          { id: 97, name: 'Sol B', model: 'gpt-5.6-sol', routing_model: 'gpt-5.6-sol', type: 'llm', protocol: 'responses', is_active: true },
        ],
        total: 2,
      }),
    })
  })
  await page.route('**/api/admin/key-pools**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pools: [] }) })
  })
  await page.route('**/api/admin/upstream-platforms', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ platforms: [] }) })
  })
  await page.route('**/api/admin/model-providers**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }) })
  })
  await page.route('**/api/admin/channels/97/token-stats**', async (route) => {
    requestedChannelId = '97'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channel: { id: 97, name: 'Sol B', model: 'gpt-5.6-sol', protocol: 'responses' },
        totals: { non_cached_input_tokens: 320, cache_read_tokens: 80, cache_creation_tokens: 0, output_tokens: 120, total_tokens: 520 },
        points: [{ label: '10:00', total_tokens: 520 }],
        start_at: '2026-07-16T00:00:00+08:00',
        end_at: '2026-07-17T00:00:00+08:00',
      }),
    })
  })

  await page.goto('/admin/channels')
  await page.getByRole('row', { name: /97/ }).getByRole('button', { name: 'Token 统计' }).click()

  await expect(page).toHaveURL(/\/admin\/channels\/97\/token-stats/)
  await expect.poll(() => requestedChannelId).toBe('97')
  await expect(page.getByText('渠道 #97', { exact: true })).toBeVisible()
  await expect(page.getByText('渠道 #94', { exact: true })).toHaveCount(0)
})
