import { expect, test } from '@playwright/test'

const themedSettings = {
  settings: {
    site_name: 'MidCode',
    logo_url: '',
    theme_color: '#0f766e',
  },
}

test('keeps routes hidden until themed settings are ready on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  let releaseSettings = () => {}
  const settingsGate = new Promise<void>((resolve) => {
    releaseSettings = resolve
  })

  await page.route('**/api/public/settings', async (route) => {
    await settingsGate
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(themedSettings),
    })
  })

  const navigation = page.goto('/login')

  await expect(page.getByRole('status', { name: '正在连接服务' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: '登录用户端' })).toHaveCount(0)
  await expect(page.getByText('FanAPI Gateway')).toHaveCount(0)

  const loadingWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(loadingWidth.scroll).toBeLessThanOrEqual(loadingWidth.client)

  releaseSettings()
  await navigation

  await expect(page.getByRole('heading', { level: 1, name: '登录用户端' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-brand-theme', '#0f766e')
  await expect.poll(() => page.locator('html').evaluate((root) => root.style.getPropertyValue('--brand-primary'))).not.toBe('')

  const readyWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(readyWidth.scroll).toBeLessThanOrEqual(readyWidth.client)
})

test('shows a retry state and enters the app after settings recover', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/public/settings', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(themedSettings),
    })
  })

  await page.goto('/login')

  await expect(page.getByRole('alert')).toContainText('站点配置加载失败')
  await expect(page.getByRole('heading', { level: 1, name: '登录用户端' })).toHaveCount(0)

  await page.getByRole('button', { name: '重新加载' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '登录用户端' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-brand-theme', '#0f766e')
  expect(attempts).toBe(2)
})

test('uses the configured brand tokens in dark mode', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('dark_mode', 'true'))
  await page.route('**/api/public/settings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(themedSettings),
  }))

  await page.goto('/login')

  await expect(page.getByRole('heading', { level: 1, name: '登录用户端' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)

  const tokens = await page.locator('html').evaluate((root) => ({
    theme: root.dataset.brandTheme,
    light: root.style.getPropertyValue('--brand-primary'),
    dark: root.style.getPropertyValue('--brand-primary-dark'),
    active: getComputedStyle(root).getPropertyValue('--primary'),
  }))
  expect(tokens.theme).toBe('#0f766e')
  expect(tokens.light).not.toBe('')
  expect(tokens.dark).not.toBe('')
  expect(tokens.active.trim()).toBe(tokens.dark.trim())
})
