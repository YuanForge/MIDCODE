import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220"><rect width="300" height="220" fill="#e2e8f0"/><circle cx="60" cy="65" r="22" fill="#3b82f6"/><rect x="130" y="100" width="35" height="35" fill="#16a34a"/><text x="20" y="190" fill="#334155">Test challenge</text></svg>').toString('base64')
async function setup(page: Page) {
  const state = { kind: 'click_text', challenges: [] as Record<string, unknown>[], answers: [] as Record<string, unknown>[], attempts: [] as { path: string; body: Record<string, unknown> }[], verifyFail: false, unavailable: false, requireAgain: false, familiar: false, delayVerify: false }
  await page.addInitScript(() => { localStorage.setItem('fanapi_language', 'zh-CN') })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/public/settings') return reply({ settings: { site_name: 'MidCode' } })
    if (path === '/api/auth/captcha/new') {
      state.challenges.push(route.request().postDataJSON())
      if (state.unavailable) return reply({ code: 'CAPTCHA_UNAVAILABLE', error: '验证服务暂不可用，请稍后重试' }, 503)
      return reply({ id: String(state.challenges.length).padStart(64, '0'), kind: state.kind, image, thumb: image, tile_width: 50, tile_height: 50, tile_x: 5, tile_y: 60, thumb_size: 140 })
    }
    if (path === '/api/auth/captcha/verify') {
      state.answers.push(route.request().postDataJSON())
      if (state.delayVerify) await new Promise(r => setTimeout(r, 500))
      if (state.verifyFail) return reply({ code: 'CAPTCHA_REQUIRED', error: '请完成人机验证后重试' }, 403)
      return reply({ token: 'mock-one-use-captcha-token' })
    }
    if (['/api/auth/login','/api/auth/send-code','/api/auth/forgot-password'].includes(path)) {
      const body = route.request().postDataJSON(); state.attempts.push({ path, body })
      if (!state.familiar && (!body.captcha_token || state.requireAgain)) return reply({ code: 'CAPTCHA_REQUIRED', error: '请完成人机验证后重试' }, 403)
      if (path.endsWith('/login')) return reply({ token: 'mock-login-token', user: { username: 'captcha-test' } })
      return reply({ message: 'sent' })
    }
    return reply({ items: [], channels: [], groups: [], preferences: [], permissions: ['*'] })
  })
  return state
}
async function login(page: Page, admin = false) {
  await page.goto(admin ? '/admin/login' : '/login')
  await page.locator(admin ? '#admin-login-username' : '#user-login-username').fill('captcha-test')
  await page.locator(admin ? '#admin-login-password' : '#user-login-password').fill('test-password')
  if (!admin) await page.getByRole('checkbox', { name: '同意用户协议' }).check()
  await page.getByRole('button', { name: admin ? '进入后台' : '登录', exact: true }).click()
}
async function solveMock(page: Page) {
  const dialog = page.getByRole('dialog', { name: '安全验证' })
  const picture = dialog.locator('img[class*="picture"]')
  await picture.click({ position: { x: 60, y: 65 } })
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
}
for (const admin of [false,true]) test(`${admin ? 'admin' : 'user'} login opens verification and resumes original request`, async ({ page }) => {
  const state = await setup(page)
  await page.setViewportSize(admin ? { width: 1440, height: 900 } : { width: 320, height: 740 })
  await login(page, admin)
  const dialog = page.getByRole('dialog', { name: '安全验证' })
  await expect(dialog.locator('img[class*="picture"]')).toBeVisible()
  expect(state.challenges[0]).toEqual({ purpose: 'login', subject: 'captcha-test' })
  const b = await dialog.boundingBox(); expect(b!.x).toBeGreaterThanOrEqual(0); expect(b!.x + b!.width).toBeLessThanOrEqual(admin ? 1441 : 321)
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await mkdir('test-results/captcha-evidence', { recursive: true })
  await page.screenshot({ path: `test-results/captcha-evidence/${admin ? 'admin' : 'user-mobile'}.png` })
  await solveMock(page)
  await expect(page).toHaveURL(admin ? /\/admin\/dashboard$/ : /\/dashboard$/)
  expect(state.attempts).toHaveLength(2)
  expect(state.attempts[1].body).toEqual({ username: 'captcha-test', password: 'test-password', captcha_token: 'mock-one-use-captcha-token' })
  expect(state.answers[0]).toMatchObject({ purpose: 'login', subject: 'captcha-test', answer: { points: [{ x: 60, y: 65 }] } })
})
for (const reset of [false,true]) test(`${reset ? 'password recovery' : 'registration code'} requires verification before sending`, async ({ page }) => {
  const state = await setup(page)
  await page.goto(reset ? '/forgot-password' : '/register')
  await page.getByLabel('邮箱', { exact: true }).fill('captcha@example.invalid')
  await page.getByRole('button', { name: reset ? '发送重置指引' : '获取验证码', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '安全验证' })).toBeVisible()
  expect(state.challenges[0]).toEqual({ purpose: reset ? 'reset_email' : 'send_code', subject: 'captcha@example.invalid' })
  await solveMock(page)
  await expect(page.getByText(reset ? '如果邮箱已绑定账号，重置指引将发送到该邮箱。' : '验证码已发送到 captcha@example.invalid，有效期 5 分钟')).toBeVisible()
  expect(state.attempts).toHaveLength(2)
  expect(state.attempts[1].body).toEqual({ email: 'captcha@example.invalid', captcha_token: 'mock-one-use-captcha-token' })
})
test('cancel never retries; expired challenge refreshes; persistent rejection retries only once', async ({ page }) => {
  const state = await setup(page)
  await login(page, true)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('人机验证已取消或过期，请重试')).toBeVisible()
  expect(state.attempts).toHaveLength(1)
  await page.getByRole('button', { name: '进入后台' }).click()
  state.verifyFail = true
  await solveMock(page)
  await expect(page.getByText('验证失败或已过期，请完成新题目。')).toBeVisible()
  await expect.poll(() => state.challenges.length).toBe(3)
  state.verifyFail = false; state.requireAgain = true
  await solveMock(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('请完成人机验证后重试')).toBeVisible()
  expect(state.attempts).toHaveLength(3)
})
test('unavailable challenge offers retry; cancelled in-flight verification cannot resume login', async ({ page }) => {
  const state = await setup(page); state.unavailable = true
  await login(page, true)
  await expect(page.getByText('验证服务暂不可用，请稍后重试')).toBeVisible()
  state.unavailable = false
  await page.getByRole('button', { name: '换一题' }).click()
  state.delayVerify = true
  await solveMock(page)
  await page.keyboard.press('Escape')
  await expect(page.getByText('人机验证已取消或过期，请重试')).toBeVisible()
  await page.waitForTimeout(650)
  expect(state.attempts).toHaveLength(1)
})
test('remembered login does not unnecessarily request a challenge', async ({ page }) => {
  const state = await setup(page); state.familiar = true
  await login(page, true)
  await expect(page).toHaveURL(/\/admin\/dashboard$/)
  expect(state.challenges).toHaveLength(0)
})
for (const kind of ['click_alpha','click_shape','slide','drag','rotate']) test(`renders ${kind} challenge`, async ({ page }) => {
  const state = await setup(page); state.kind = kind
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await login(page, true)
  const dialog = page.getByRole('dialog', { name: '安全验证' })
  await expect(dialog.locator('img').first()).toBeVisible()
  await expect(dialog.getByRole('button', { name: '换一题' })).toBeEnabled()
  expect(errors).toEqual([])
})
