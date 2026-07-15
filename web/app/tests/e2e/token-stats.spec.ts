import { expect, test } from '@playwright/test'

test('renders exact per model Token usage without cross-model totals', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'mock-user-token')
  })
  await page.route('**/api/public/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }),
    })
  })
  await page.route('**/api/user/stats/tokens**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { model: 'gpt-5.6-sol', non_cached_input_tokens: 320, cache_read_tokens: 80, cache_creation_tokens: 0, output_tokens: 120, total_tokens: 520 },
          { model: 'gpt-5.6-terra', non_cached_input_tokens: 200, cache_read_tokens: 20, cache_creation_tokens: 0, output_tokens: 60, total_tokens: 280 },
          { model: 'claude-4.5', non_cached_input_tokens: 180, cache_read_tokens: 70, cache_creation_tokens: 30, output_tokens: 90, total_tokens: 370 },
        ],
        page: 1,
        page_size: 20,
        total: 3,
        start_at: '2026-07-16T00:00:00+08:00',
        end_at: '2026-07-17T00:00:00+08:00',
      }),
    })
  })

  await page.goto('/stats')

  for (const model of ['gpt-5.6-sol', 'gpt-5.6-terra', 'claude-4.5']) {
    await expect(page.getByText(model, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByText('Other', { exact: true })).toHaveCount(0)
  await expect(page.getByText('累计 Token', { exact: true })).toHaveCount(0)
  await expect(page.getByText('今日 Token', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('table')).toBeVisible()
})
