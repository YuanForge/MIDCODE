import { expect, test, type Page } from '@playwright/test'

// These browser tests exercise the rendered app with an account-scoped API fixture.
// Database isolation and the real PATCH contract are covered by Go integration tests.
type Preference = { routing_model: string; pinned: boolean; favorite: boolean }
const channels = [
  { id: 11, name: 'gpt-6-astra', routing_model: 'gpt-6-astra', type: 'llm', protocol: 'responses', model_provider: 'OpenAI', billing_type: 'token', price_display: '¥1.7000 / 1M 输入 + ¥8.5000 / 1M 输出', description: '通用语言模型' },
  { id: 12, name: 'gpt-5.6-sol', routing_model: 'gpt-5.6-sol', type: 'llm', protocol: 'responses', model_provider: 'OpenAI', billing_type: 'token', price_display: '¥1.3600 / 1M 输入 + ¥5.1000 / 1M 输出', description: '常用推理模型' },
  { id: 13, name: 'image-demo', routing_model: 'image-demo', type: 'image', protocol: 'openai', model_provider: 'Example', billing_type: 'image', description: '图片生成模型' },
]

async function setup(page: Page, initialToken = 'account-a') {
  const state = {
    users: new Map<string, Map<string, Preference>>(),
    patches: [] as Array<{ token: string; payload: Partial<Preference> }>,
    failPatch: false,
    failList: false,
    delayListToken: '',
    releaseList: undefined as undefined | (() => void),
    calls: [] as string[],
  }
  await page.addInitScript(token => {
    if (!sessionStorage.getItem('fixture-initialized')) {
      if (token) localStorage.setItem('token', token)
      sessionStorage.setItem('fixture-initialized', 'true')
    }
    localStorage.setItem('fanapi_language', 'zh-CN')
  }, initialToken)
  // Production emits this branding bootstrap at runtime; Vite preview does not.
  await page.route('**/env.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__FANAPI_ENV__ = { site_name: "MidCode" };' }))
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const token = (request.headers().authorization ?? '').replace(/^Bearer /, '')
    state.calls.push(`${request.method()} ${path}`)
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/user/model-preferences') {
      if (!token) return respond({ error: 'unauthorized' }, 401)
      const saved = state.users.get(token) ?? new Map<string, Preference>()
      state.users.set(token, saved)
      if (request.method() === 'PATCH') {
        const payload = request.postDataJSON() as Partial<Preference>
        state.patches.push({ token, payload })
        if (state.failPatch) return respond({ error: '偏好保存失败，请重试' }, 500)
        const routing_model = payload.routing_model!
        const next = { routing_model, pinned: false, favorite: false, ...saved.get(routing_model), ...payload }
        saved.set(routing_model, next)
        return respond(next)
      }
      if (state.delayListToken === token) await new Promise<void>(resolve => { state.releaseList = resolve })
      if (state.failList) return respond({ error: '偏好读取失败' }, 500)
      return respond({ preferences: [...saved.values()] })
    }
    if (path.endsWith('/channels')) return respond({ channels })
    if (path.endsWith('/model-availability')) return respond({ models: [] })
    if (path.endsWith('/settings')) return respond({ settings: { site_name: 'MidCode', logo_url: '' } })
    if (path.endsWith('/profile')) return respond({ id: token === 'account-b' ? 202 : 101, username: token || 'guest', balance: 0 })
    if (path.endsWith('/received-latest')) return respond({ gift: null })
    return respond({})
  })
  return state
}

const card = (page: Page, model: string) => page.locator(`[data-model="${model}"]`)
const order = (page: Page) => page.locator('[data-model]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-model')))

test('favorites persist across reload and pinning respects filters on desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(60000)
  const state = await setup(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.location().url}: ${message.text()}`) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/models')
  await expect(page).toHaveURL(/\/models$/)
  await expect(page).toHaveTitle(/MidCode/)
  await expect(page.getByRole('tab', { name: '全部模型', exact: true })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(card(page, 'gpt-5.6-sol').getByRole('button', { name: '收藏 gpt-5.6-sol', exact: true })).toBeEnabled()
  await card(page, 'gpt-5.6-sol').getByRole('button', { name: '收藏 gpt-5.6-sol', exact: true }).click()
  await expect(page.getByRole('tab', { name: '收藏 (1)', exact: true })).toBeVisible()
  await card(page, 'gpt-5.6-sol').getByRole('button', { name: '置顶 gpt-5.6-sol', exact: true }).click()
  await expect(card(page, 'gpt-5.6-sol')).toHaveAttribute('data-pinned', 'true')
  await expect.poll(() => order(page)).toEqual(['gpt-5.6-sol', 'gpt-6-astra', 'image-demo'])
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('model-preferences-desktop.png'), fullPage: false })
  await page.reload()
  await expect(card(page, 'gpt-5.6-sol').getByRole('button', { name: '取消收藏 gpt-5.6-sol' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => order(page)).toEqual(['gpt-5.6-sol', 'gpt-6-astra', 'image-demo'])
  await page.getByText('Image 绘图', { exact: true }).click()
  await expect.poll(() => order(page)).toEqual(['image-demo'])
  await page.getByText('全部', { exact: true }).click()
  await expect.poll(() => order(page)).toEqual(['gpt-5.6-sol', 'gpt-6-astra', 'image-demo'])
  await page.getByText('Example', { exact: true }).first().click()
  await expect.poll(() => order(page)).toEqual(['image-demo'])
  await page.getByText('全部企业', { exact: true }).click()
  const search = page.getByPlaceholder(/搜索/)
  await search.fill('image-demo')
  await expect.poll(() => order(page)).toEqual(['image-demo'])
  await search.fill('gpt')
  await expect.poll(() => order(page)).toEqual(['gpt-5.6-sol', 'gpt-6-astra'])
  await search.fill('')
  await page.getByRole('tab', { name: '收藏 (1)', exact: true }).click()
  await expect.poll(() => order(page)).toEqual(['gpt-5.6-sol'])
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(card(page, 'gpt-5.6-sol').getByRole('button', { name: '取消置顶 gpt-5.6-sol' })).toBeVisible()
  await expect(card(page, 'gpt-5.6-sol').getByRole('button', { name: '取消收藏 gpt-5.6-sol' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: testInfo.outputPath('model-preferences-mobile.png'), fullPage: false })
  await card(page, 'gpt-5.6-sol').getByRole('button', { name: '取消收藏 gpt-5.6-sol' }).click()
  await expect(page.getByText('还没有收藏模型', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '收藏 (0)', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '全部模型', exact: true }).click()
  await expect(card(page, 'gpt-5.6-sol')).toHaveAttribute('data-pinned', 'true')
  await card(page, 'gpt-5.6-sol').getByRole('button', { name: '取消置顶 gpt-5.6-sol' }).click()
  await expect.poll(() => order(page)).toEqual(['gpt-6-astra', 'gpt-5.6-sol', 'image-demo'])
  expect(state.patches.map(item => item.payload)).toEqual([
    { routing_model: 'gpt-5.6-sol', favorite: true }, { routing_model: 'gpt-5.6-sol', pinned: true },
    { routing_model: 'gpt-5.6-sol', favorite: false }, { routing_model: 'gpt-5.6-sol', pinned: false },
  ])
  expect(errors).toEqual([])
})

test('failed saves preserve state and failed reads allow retry', async ({ page }) => {
  const state = await setup(page)
  state.failList = true
  await page.goto('/models')
  await expect(page.getByText(/收藏和置顶加载失败/)).toBeVisible()
  await expect(card(page, 'gpt-6-astra').getByRole('button', { name: '收藏 gpt-6-astra', exact: true })).toBeDisabled()
  state.failList = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(card(page, 'gpt-6-astra').getByRole('button', { name: '收藏 gpt-6-astra', exact: true })).toBeEnabled()
  state.failPatch = true
  await card(page, 'gpt-6-astra').getByRole('button', { name: '收藏 gpt-6-astra', exact: true }).click()
  await expect(page.getByText('偏好保存失败，请重试', { exact: true })).toBeVisible()
  await expect(card(page, 'gpt-6-astra').getByRole('button', { name: '收藏 gpt-6-astra', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('tab', { name: '收藏 (0)', exact: true })).toBeVisible()
  expect(state.users.get('account-a')?.size).toBe(0)
})

test('switching accounts hides previous preferences while the next account loads', async ({ page }) => {
  const state = await setup(page)
  state.users.set('account-a', new Map([['gpt-5.6-sol', { routing_model: 'gpt-5.6-sol', favorite: true, pinned: true }]]))
  await page.goto('/models')
  await expect(page.getByRole('tab', { name: '收藏 (1)', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '收藏 (1)', exact: true }).click()
  state.delayListToken = 'account-b'
  await page.evaluate(() => { localStorage.setItem('token', 'account-b'); window.dispatchEvent(new Event('fanapi-auth-change')) })
  await expect(card(page, 'gpt-5.6-sol')).toHaveCount(0)
  await expect.poll(() => !!state.releaseList).toBe(true)
  state.releaseList!()
  await expect(page.getByText('还没有收藏模型', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '全部模型', exact: true }).click()
  await expect(card(page, 'gpt-5.6-sol')).toHaveAttribute('data-pinned', 'false')
  await card(page, 'gpt-6-astra').getByRole('button', { name: '收藏 gpt-6-astra', exact: true }).click()
  await expect(page.getByRole('tab', { name: '收藏 (1)', exact: true })).toBeVisible()
  expect(state.users.get('account-a')?.get('gpt-5.6-sol')?.favorite).toBe(true)
  expect(state.users.get('account-b')?.get('gpt-6-astra')?.favorite).toBe(true)
  expect(state.patches[0].token).toBe('account-b')
})

test('guests see login guidance and never send preference writes', async ({ page }) => {
  const state = await setup(page, '')
  await page.goto('/models')
  await expect(page.getByText('登录后可置顶和收藏常用模型', { exact: true })).toBeVisible()
  await card(page, 'gpt-5.6-sol').getByRole('button', { name: '收藏 gpt-5.6-sol', exact: true }).click()
  await expect(page.getByText('请先登录，再收藏或置顶常用模型', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '收藏 (0)', exact: true }).click()
  await expect(page.getByText('登录后查看你的收藏', { exact: true })).toBeVisible()
  expect(state.patches).toEqual([])
  expect(state.calls.some(call => call.endsWith('/model-preferences'))).toBe(false)
})
