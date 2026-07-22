import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('model cards load one bulk availability response and render all states', async () => {
  const [api, page] = await Promise.all([
    source('src/lib/api/user.ts'),
    source('src/pages/user/UserModelsPage.tsx'),
  ])
  assert.match(api, /export type ModelAvailability/)
  assert.match(api, /getModelAvailability/)
  assert.match(api, /\/user\/model-availability/)
  assert.match(page, /userApi\.getModelAvailability\(\)/)
  for (const label of ['正常', '降级', '异常', '数据较少', '暂无调用数据', '统计暂不可用']) {
    assert.match(page, new RegExp(label))
  }
  assert.match(page, /最近 60 次/)
  assert.match(page, /P50/)
})
