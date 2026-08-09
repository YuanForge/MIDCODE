import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('admin settings isolates the automatic USD/CNY exchange rate', async () => {
  const page = await source('src/pages/admin/AdminSettingsPage.tsx')

  assert.match(page, /official-prices/)
  assert.match(page, /官方价/)
  assert.doesNotMatch(page, /type="number"[\s\S]{0,240}usd_cny_exchange_rate/)
  assert.doesNotMatch(page, /exchangeRateValid/)
  assert.match(page, /startsWith\('usd_cny_exchange_rate'\)/)
  assert.match(page, /overflow-x-auto/)
  assert.match(page, /shrink-0/)
})
