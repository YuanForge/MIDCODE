import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../../src/pages/admin/AdminModelGroupsPage.tsx', import.meta.url), 'utf8')

test('model groups batch-select models with one channel per model', () => {
  assert.match(page, /modelOptions/)
  assert.match(page, /selectedModelChannels/)
  assert.match(page, /保存模型绑定/)
  assert.doesNotMatch(page, /SelectValue placeholder="选择渠道"/)
})
