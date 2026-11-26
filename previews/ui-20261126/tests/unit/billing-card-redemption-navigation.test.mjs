import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('exchange links redirect to billing card redemption without duplicate navigation', async () => {
  const [router, consoleLayout, adminSettingsPage] = await Promise.all([
    source('src/app/router.tsx'),
    source('src/layouts/ConsoleLayout.tsx'),
    source('src/pages/admin/AdminSettingsPage.tsx'),
  ])

  assert.doesNotMatch(router, /const UserExchangePage/)
  assert.match(router, /\{ path: '\/exchange', element: <Navigate replace to="\/billing\?tab=recharge" \/> \}/)
  assert.doesNotMatch(consoleLayout, /href: '\/exchange'/)
  assert.match(adminSettingsPage, /用户端「积分充值」会显示购买卡密入口/)
  assert.doesNotMatch(adminSettingsPage, /「兑换中心」/)
})
