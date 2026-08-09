import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('official prices use an automatic isolated settings tab', async () => {
  const settings = await source('src/pages/admin/AdminSettingsPage.tsx')
  const tab = await source('src/pages/admin/AdminOfficialPricesTab.tsx')
  const api = await source('src/lib/api/admin.ts')

  assert.match(settings, /official-prices/)
  assert.doesNotMatch(settings, /type="number"[\s\S]{0,240}usd_cny_exchange_rate/)
  assert.match(tab, /listModelOfficialPrices/)
  assert.match(tab, /Frankfurter/)
  assert.match(tab, /AlertDialog/)
  assert.match(tab, /max-h-\[86vh\]/)
  assert.match(tab, /overflow-y-auto/)
  assert.match(tab, /shrink-0/)
  assert.match(tab, /size_prices/)
  assert.match(tab, /cache_creation_price_per_1m_tokens/)
  for (const method of ['listModelOfficialPrices', 'createModelOfficialPrice', 'updateModelOfficialPrice', 'setModelOfficialPriceStatus', 'deleteModelOfficialPrice']) {
    assert.match(api, new RegExp(method))
  }
})
