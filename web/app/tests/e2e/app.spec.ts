import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        settings: {
          site_name: 'MidCode',
          logo_url: '',
        },
      }),
    })
  })

  await page.route('**/api/admin/channels', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ channels: [] }),
    })
  })

  await page.route('**/openapi-user.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'MidCode', version: '1.0.0' },
        paths: {},
      }),
    })
  })
})

test('shows a wider model details sheet with a JavaScript call example', async ({ page }) => {
  await page.route('**/api/user/channels', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: [{
          id: 1,
          name: 'gpt-5.6-sol',
          routing_model: 'gpt-5.6-sol',
          model_provider: 'OpenAI',
          description: 'Test model',
          type: 'llm',
          protocol: 'openai',
          billing_type: 'token',
          price_display: '¥0.6800 / 1M 输入 + ¥4.0800 / 1M 输出',
          group_prices: [],
        }],
      }),
    })
  })
  await page.route('**/api/user/model-availability', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/models')
  await page.getByRole('heading', { name: 'gpt-5.6-sol' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThan(700)

  await page.getByRole('tab', { name: 'JavaScript' }).click()
  await expect(dialog.getByText('const response = await fetch', { exact: false })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 1000).toBeLessThanOrEqual(390)
})

test('configures Fast ratio through the channel editor', async ({ page }) => {
  let savedPayload: Record<string, unknown> | undefined

  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })

  await page.route('**/api/admin/channels**', async (route) => {
    if (route.request().method() === 'POST') {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1 }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ channels: [], total: 0 }) })
  })
  await page.route('**/api/admin/key-pools**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pools: [] }) })
  })
  await page.route('**/api/admin/upstream-platforms', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ platforms: [] }) })
  })

  await page.goto('/admin/channels')
  await page.getByRole('button', { name: '新增渠道' }).click()

  await page.locator('label', { hasText: '路由名称' }).locator('..').locator('input').fill('Fast Test')
  await page.locator('label', { hasText: '标准模型名' }).locator('..').locator('input').fill('gpt-5.4')
  await page.locator('label', { hasText: '上游 URL' }).locator('..').locator('input').fill('https://api.openai.com/v1/chat/completions')
  await page.getByRole('tab', { name: '计费' }).click()

  await page.locator('label', { hasText: '利润倍率' }).locator('..').locator('input').fill('2')
  await page.locator('label', { hasText: 'Fast 倍率' }).locator('..').locator('input').fill('2')
  await page.locator('label', { hasText: '输入成本' }).locator('..').locator('input').fill('1')
  await page.locator('label', { hasText: '输出成本' }).locator('..').locator('input').fill('2')

  await expect(page.getByText(/Fast 输入约 CNY 4/)).toBeVisible()
  await expect(page.getByText(/Fast 输出约 CNY 8/)).toBeVisible()
  await page.getByRole('button', { name: '保存' }).click()

  await expect.poll(() => savedPayload).toBeTruthy()
  expect(savedPayload?.billing_config).toMatchObject({ fast_ratio: 2 })
})

test('renders user login page', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { level: 1, name: '登录用户端' })).toBeVisible()
  await expect(page.getByPlaceholder('请输入用户名或邮箱')).toBeVisible()
})

test('renders admin login page', async ({ page }) => {
  await page.goto('/admin/login', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { level: 1, name: '登录管理后台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '进入后台' })).toBeVisible()
})

test('redirects protected user route to login when unauthenticated', async ({ page }) => {
  await page.goto('/stats')

  await expect(page).toHaveURL(/\/login$/)
})

test('renders user dashboard with authenticated mocks', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'mock-user-token')
  })

  await page.route('**/api/user/balance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balance_credits: 1800000 }),
    })
  })

  await page.route('**/api/user/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_consumed: 5200000,
        today_consumed: 1200000,
      }),
    })
  })

  await page.goto('/dashboard')

  await expect(page.getByText('用户数据看板')).toBeVisible()
  await expect(page.getByText('1.80', { exact: true })).toBeVisible()
  await expect(page.getByText('5.20')).toBeVisible()
  await expect(page.getByText('1.20')).toBeVisible()
})

test('renders successful user logs with a green status badge', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'mock-user-token')
  })

  await page.route('**/api/v1/llm-logs**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ id: 1, model: 'gpt-test', status: 'ok', created_at: '2026-07-16T00:00:00Z' }],
        total: 1,
      }),
    })
  })

  await page.goto('/llm-logs')

  const successBadge = page.getByText('成功', { exact: true })
  await expect(successBadge).toBeVisible()
  await expect(successBadge).toHaveClass(/text-emerald-700/)
})

test('renders admin dashboard with authenticated mocks', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })

  await page.route('**/api/admin/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_users: 42,
        channels: 12,
        active_channels: 9,
        today: { revenue: 3800000, cost: 2700000, profit: 1100000, count: 8 },
        total: { revenue: 9900000, cost: 6400000, profit: 3500000 },
      }),
    })
  })

  await page.goto('/admin/dashboard')

  await expect(page.getByText('平台运营看板')).toBeVisible()
  await expect(page.getByText('42', { exact: true })).toBeVisible()
  await expect(page.getByText('9 / 12', { exact: true })).toBeVisible()
  await expect(page.getByText('¥3.8000', { exact: true })).toBeVisible()
  await expect(page.getByText('¥9.9000', { exact: true })).toBeVisible()
})

test('renders extended user routes with authenticated session', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'mock-user-token')
  })

  await page.route('**/api/user/apikeys', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        api_keys: [{ id: 1, name: 'playground-key', key: 'sk-test-key' }],
      }),
    })
  })

  await page.route('**/api/user/channels', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: [
          { id: 1, name: 'GPT-4o', routing_model: 'gpt-4o', type: 'llm' },
          { id: 2, name: 'Image Model', routing_model: 'nano-banana-pro', type: 'image' },
          { id: 3, name: 'Video Model', routing_model: 'video-pro', type: 'video' },
        ],
      }),
    })
  })

  await page.route('**/api/user/cards/redeem-history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: [] }),
    })
  })

  await page.route('**/api/user/invite', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ invite_code: 'ABC123', invite_count: 2, frozen_balance: 500000 }),
    })
  })

  await page.route('**/api/user/payment-qr', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ wechat_qr: '', alipay_qr: '' }),
    })
  })

  await page.route('**/api/user/withdraw/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: [] }),
    })
  })

  await page.route('**/api/user/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_consumed: 5200000,
        today_consumed: 1200000,
        daily_credits: [{ day: '04-20', credits: 1200000 }],
      }),
    })
  })

  for (const route of ['/playground', '/image-gen', '/video-gen', '/docs', '/stats', '/exchange', '/invite']) {
    await page.goto(route)
    if (route === '/docs') {
      await expect(page.getByTestId('scalar-root')).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    }
  }
})

test('renders extended admin routes with authenticated session', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('admin_token', 'mock-admin-token')
    window.localStorage.setItem('MidCode_ui_mode', 'admin')
  })

  await page.route('**/api/admin/key-pools**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pools: [{ id: 1, name: 'Pool A', channel_id: 1, is_active: true, vendor_submittable: true }] }),
    })
  })

  await page.route('**/api/admin/ocpc/platforms**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ list: [{ id: 1, platform: 'baidu', name: 'Baidu Main', enabled: true, baidu_page_url: 'https://example.com' }] }),
    })
  })

  await page.route('**/api/admin/ocpc/schedule', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schedule: { ocpc_schedule_enabled: 'true', ocpc_schedule_interval: '30' } }),
    })
  })

  await page.route('**/api/admin/cards**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cards: [], total: 0 }),
    })
  })

  await page.route('**/api/admin/withdrawals**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: [], total: 0 }),
    })
  })

  await page.route('**/api/admin/withdrawals/pending-count', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0 }),
    })
  })

  for (const route of ['/admin/key-pools', '/admin/ocpc', '/admin/cards', '/admin/withdraw']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
})
