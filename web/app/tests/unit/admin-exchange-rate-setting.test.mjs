import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('admin settings exposes a validated USD/CNY exchange rate setting', async () => {
  const page = await source('src/pages/admin/AdminSettingsPage.tsx')

  assert.match(page, /USD\/CNY 汇率/)
  assert.match(page, /usd_cny_exchange_rate/)
  assert.match(page, /type="number"/)
  assert.match(page, /exchangeRateValid/)
})
