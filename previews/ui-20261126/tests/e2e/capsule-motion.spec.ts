import { expect, test, type Locator, type Page } from '@playwright/test'

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/settings', (route) =>
    route.fulfill(json({ settings: { site_name: 'MidCode', logo_url: '' } })),
  )
})

type Shape = { label: string; width: number; height: number; radius: number }

/** What makes a control a capsule: a corner radius of at least half its shorter side. */
function shapeOf(locator: Locator): Promise<Shape[]> {
  return locator.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect()
      return {
        label:
          (node.textContent ?? '').trim().slice(0, 24) || node.getAttribute('aria-label') || node.getAttribute('title') || node.tagName,
        width: box.width,
        height: box.height,
        radius: Number.parseFloat(getComputedStyle(node).borderTopLeftRadius),
      }
    }),
  )
}

function expectCapsules(shapes: Shape[]) {
  expect(shapes.length).toBeGreaterThan(0)
  for (const shape of shapes) {
    expect(shape.radius, `${shape.label} (${shape.width}×${shape.height})`).toBeGreaterThanOrEqual(
      Math.min(shape.width, shape.height) / 2,
    )
  }
}

const pressedScale = (button: Locator) =>
  button.evaluate((node) => {
    const scale = getComputedStyle(node).scale
    return scale === 'none' ? 1 : Number.parseFloat(scale)
  })

async function signInAsUser(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/user/balance', (route) => route.fulfill(json({ balance_credits: 128450000 })))
  await page.route('**/api/user/stats', (route) => route.fulfill(json({})))
}

test('buttons are capsules and fields are soft rectangles on the sign-in page', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible()

  expectCapsules(await shapeOf(page.locator('[data-slot="button"]:visible')))

  const fields = await shapeOf(page.locator('input[data-slot="input"]:visible'))
  expect(fields.length).toBe(2)
  for (const field of fields) {
    expect(field.radius).toBe(10)
    expect(field.radius).toBeLessThan(field.height / 2)
  }
})

test('the user console keeps every button and button-like control a capsule', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAsUser(page)
  await page.goto('/dashboard')
  await expect(page.locator('[data-slot="top-bar"]')).toBeVisible()

  expectCapsules(await shapeOf(page.locator('[data-slot="button"]:visible')))
  // Drawn by hand rather than with Button: the command trigger, the section links and the balance in the bar.
  expectCapsules(await shapeOf(page.locator('[data-slot="top-bar"] > button:visible')))
  expectCapsules(await shapeOf(page.locator('[data-slot="top-bar"] a[href="/billing"]:visible')))
  expectCapsules(await shapeOf(page.locator('[data-slot="top-bar"] nav a:visible')))

  // An icon-only button is a circle.
  const theme = (await shapeOf(page.getByRole('button', { name: 'Toggle theme' })))[0]
  expect(theme.width).toBe(theme.height)
})

test('a pressed capsule shrinks and springs back', async ({ page }) => {
  await page.goto('/login')
  const submit = page.getByRole('button', { name: '登录' })
  const box = await submit.boundingBox()
  if (!box) throw new Error('the sign-in button is not laid out')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect.poll(() => pressedScale(submit)).toBe(0.97)
  // Leave the button before releasing, so the press is cancelled and the form is not submitted.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 80)
  await page.mouse.up()
  await expect.poll(() => pressedScale(submit)).toBe(1)
})

test('with reduced motion a pressed capsule keeps its size and transitions are collapsed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')
  const submit = page.getByRole('button', { name: '登录' })
  const box = await submit.boundingBox()
  if (!box) throw new Error('the sign-in button is not laid out')

  const longest = await submit.evaluate((node) =>
    Math.max(...getComputedStyle(node).transitionDuration.split(',').map((value) => Number.parseFloat(value))),
  )
  expect(longest).toBeLessThan(0.001)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(150)
  expect(await pressedScale(submit)).toBe(1)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 80)
  await page.mouse.up()
})

test('the segmented selection travels to the chosen tab in the admin console', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })
  await page.route('**/api/admin/cards**', (route) => route.fulfill(json({ cards: [], total: 0 })))
  await page.goto('/admin/cards')

  const list = page.locator('[data-slot="tabs-list"][data-variant="default"]')
  const capsule = list.locator('[data-slot="tabs-indicator"]')
  const first = page.getByRole('tab', { name: '批次管理' })
  const second = page.getByRole('tab', { name: '卡密列表' })
  await expect(list).toHaveAttribute('data-indicator', 'ready')

  const offset = async (tab: Locator) => {
    const [a, b] = await Promise.all([capsule.boundingBox(), tab.boundingBox()])
    if (!a || !b) return Number.POSITIVE_INFINITY
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height))
  }
  const fill = (tab: Locator) => tab.evaluate((node) => getComputedStyle(node).backgroundColor)

  // One capsule carries the fill; the selected tab itself stays clear.
  await expect.poll(() => offset(first)).toBeLessThanOrEqual(1)
  expectCapsules(await shapeOf(capsule))
  await expect.poll(() => fill(first)).toBe('rgba(0, 0, 0, 0)')

  await second.click()
  await expect(second).toHaveAttribute('data-state', 'active')
  await expect.poll(() => offset(second)).toBeLessThanOrEqual(1)
  await expect.poll(() => fill(second)).toBe('rgba(0, 0, 0, 0)')
  expect(await capsule.count()).toBe(1)
})
