import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = () => readFile(new URL('../../src/pages/user/UserModelsPage.tsx', import.meta.url), 'utf8')

test('model details use a wider desktop sheet and include JavaScript examples', async () => {
  const page = await source()

  assert.match(page, /data-\[side=right\]:sm:max-w-4xl/)
  assert.match(page, /type LangTab = .*'javascript'/)
  assert.match(page, /<TabsTrigger value="javascript">JavaScript<\/TabsTrigger>/)
  assert.match(page, /await fetch\(/)
})

test('user model cards prefer the lowest terminal group price', async () => {
  const page = await source()

  assert.match(page, /function terminalPriceSortKey/)
  assert.match(page, /function sortGroupPricesByTerminalPrice/)
  assert.match(page, /function channelSummaryPrice/)
  assert.match(page, /sortGroupPricesByTerminalPrice\(channel\.group_prices\)/)
  assert.match(page, /channelSummaryPrice\(channel\)\.split\('\\n'\)/)
})
