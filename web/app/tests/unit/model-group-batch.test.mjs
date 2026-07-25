import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../../src/pages/admin/AdminModelGroupsPage.tsx', import.meta.url), 'utf8')

test('model group creation selects the new group before editing bindings', () => {
  assert.match(page, /const savedGroup = await adminApi\.createModelGroup\(form\)/)
  assert.match(page, /setSelectedGroupID\(savedGroup\.id\)/)
  assert.match(page, /await loadBindings\(savedGroup\.id\)/)
})

test('model binding controls stay disabled until a group is selected', () => {
  assert.match(page, /<fieldset disabled=\{!selectedGroupID\}/)
  assert.match(page, /请先选择或创建一个模型分组/)
})

test('model groups batch-select models with one channel per model', () => {
  assert.match(page, /modelOptions/)
  assert.match(page, /selectedModelChannels/)
  assert.match(page, /保存模型绑定/)
  assert.doesNotMatch(page, /SelectValue placeholder="选择渠道"/)
})
