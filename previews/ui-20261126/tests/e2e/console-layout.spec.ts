import { expect, test, type Page } from '@playwright/test'

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/settings', (route) =>
    route.fulfill(json({ settings: { site_name: 'MidCode', logo_url: '' } })),
  )
})

async function signInAsUser(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/user/balance', (route) => route.fulfill(json({ balance_credits: 128450000 })))
  await page.route('**/api/user/stats', (route) => route.fulfill(json({})))
}

test('the user console is a floating bar of sections with a switcher inside a section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAsUser(page)
  await page.goto('/dashboard')

  const bar = page.locator('[data-slot="top-bar"]')
  await expect(bar).toBeVisible()
  // No side rail on the user side: seven sections sit in the bar, and the open one is marked.
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0)
  await expect(bar.locator('nav a')).toHaveCount(7)
  await expect(bar.locator('nav a[href="/dashboard"]')).toHaveAttribute('data-active', 'true')
  await expect(page.locator('[data-slot="nav-balance"]')).toContainText('128.45')
  await expect(page.locator('[data-slot="page-icon"]')).toBeVisible()

  // The bar floats: it touches neither the top nor the side of the window.
  const box = await bar.boundingBox()
  expect(box?.x ?? 0).toBeGreaterThan(4)
  expect(box?.y ?? 0).toBeGreaterThan(4)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(1440 - 4)

  // A section with several pages shows them above the page, and the section stays marked in the bar.
  await bar.locator('nav a[href="/llm-logs"]').click()
  const switcher = page.locator('[data-slot="section-nav"]')
  await expect(switcher.locator('a')).toHaveCount(3)
  await expect(switcher.locator('a[href="/llm-logs"]')).toHaveAttribute('aria-current', 'page')
  await switcher.locator('a[href="/tasks"]').click()
  await expect(page).toHaveURL(/\/tasks$/)
  await expect(switcher.locator('a[href="/tasks"]')).toHaveAttribute('aria-current', 'page')
  await expect(bar.locator('nav a[href="/llm-logs"]')).toHaveAttribute('data-active', 'true')

  // A section with one page has no switcher.
  await bar.locator('nav a[href="/keys"]').click()
  await expect(page.locator('[data-slot="section-nav"]')).toHaveCount(0)
})

test('the overview asks nothing of the server for a guest', async ({ page }) => {
  const calls: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/user/') || path.startsWith('/v1/')) calls.push(path)
  })
  await page.goto('/dashboard')

  await expect(page.getByRole('link', { name: '登录' }).first()).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(calls).toEqual([])
})

test('the administrator rail has six sections and stays folded until the window has room', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('admin_token', 'mock-admin-token'))
  await page.route('**/api/admin/me', (route) => route.fulfill(json({ permissions: ['*'] })))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/dashboard')
  const rail = page.locator('[data-slot="sidebar"]').first()
  await expect(rail).toHaveAttribute('data-state', 'collapsed')
  await expect(rail.locator('[data-slot="sidebar-menu"] a')).toHaveCount(6)

  await page.setViewportSize({ width: 1760, height: 950 })
  await page.goto('/admin/users')
  await expect(page.locator('[data-slot="sidebar"]').first()).toHaveAttribute('data-state', 'expanded')
  await expect(page.locator('[data-slot="sidebar-menu"] a[href="/admin/users"]')).toHaveAttribute('data-active', 'true')

  // The pages of the section are one click away, and the rail keeps the section marked.
  const switcher = page.locator('[data-slot="section-nav"]')
  await expect(switcher.locator('a')).toHaveCount(5)
  await switcher.locator('a[href="/admin/api-keys"]').click()
  await expect(page).toHaveURL(/\/admin\/api-keys$/)
  await expect(page.locator('[data-slot="sidebar-menu"] a[href="/admin/users"]')).toHaveAttribute('data-active', 'true')

  // Folding the rail is remembered.
  await page.locator('[data-slot="top-bar"] > button').first().click()
  await expect(page.locator('[data-slot="sidebar"]').first()).toHaveAttribute('data-state', 'collapsed')
  await page.reload()
  await expect(page.locator('[data-slot="sidebar"]').first()).toHaveAttribute('data-state', 'collapsed')
})

test('models are cards in a grid and a card opens the API sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAsUser(page)
  await page.route('**/api/user/channels', (route) =>
    route.fulfill(
      json({
        channels: ['gpt-5.6-sol', 'claude-sonnet', 'gemini-flash', 'qwen-max'].map((name, index) => ({
          id: index + 1,
          name,
          routing_model: name,
          model_provider: 'Provider',
          type: 'llm',
          protocol: 'openai',
          billing_type: 'token',
          price_display: '¥0.6800 / 1M 输入 + ¥4.0800 / 1M 输出',
          group_prices: [],
        })),
      }),
    ),
  )
  await page.route('**/api/user/model-availability', (route) => route.fulfill(json({ models: [] })))
  await page.goto('/models')

  const cards = page.locator('[data-slot="model-card"]')
  await expect(cards).toHaveCount(4)
  const columns = new Set(await cards.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left))))
  expect(columns.size).toBeGreaterThanOrEqual(3)
  // The price is on the card itself, so models can be compared without opening them.
  const price = cards.first().locator('[data-slot="model-price"]')
  await expect(price).toContainText('¥0.68')
  await expect(price).toContainText('¥4.08')

  await cards.nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // On a phone the grid is one column and nothing pushes the page wider than the screen.
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  const phoneColumns = new Set(await cards.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left))))
  expect(phoneColumns.size).toBe(1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
