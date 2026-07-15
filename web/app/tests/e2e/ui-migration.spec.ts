import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }),
    }),
  )
})

test('public and auth surfaces use MidCode branding', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('MidCode')
  await expect(page.getByText('FanAPI Gateway')).not.toBeVisible()

  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('section').getByText('MidCode', { exact: true })).toBeVisible()
})

test('user console exposes the shared shell', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/user/balance', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"balance_credits":0}' }),
  )
  await page.route('**/api/user/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto('/dashboard')
  await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
  await expect(page.locator('[data-slot="page-container"]')).toBeVisible()
})
