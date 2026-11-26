import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../../src/pages/admin/AdminModelGroupsPage.tsx', import.meta.url), 'utf8')
const adminApi = await readFile(new URL('../../src/lib/api/admin.ts', import.meta.url), 'utf8')

test('model groups use one save action for metadata and model bindings', () => {
  assert.match(page, /const savedGroup = await adminApi\.createModelGroup\(form\)/)
  assert.match(page, /await replaceModelBindings\(groupID\)/)
  assert.match(page, /form\.id \? '保存修改' : '创建并保存'/)
  assert.doesNotMatch(page, /保存模型绑定|保存分组/)
})

test('new groups can select bindings before the first save', () => {
  assert.doesNotMatch(page, /<fieldset disabled=\{!selectedGroupID\}/)
  assert.doesNotMatch(page, /请先选择或创建一个模型分组/)
})

test('clicking a model group loads its metadata and bindings for editing', () => {
  assert.match(page, /<TableRow[^>]+onClick=\{\(\) => edit\(group\)\}/)
  assert.match(page, /void loadBindings\(group\.id\)/)
})

test('model groups batch-select models with one channel per model', () => {
  assert.match(page, /modelOptions/)
  assert.match(page, /selectedModelChannels/)
  assert.doesNotMatch(page, /SelectValue placeholder="选择渠道"/)
})

test('model groups require and display one model provider', () => {

  assert.match(adminApi, /export type AdminModelGroup = \{[\s\S]*model_provider_id\?: number[\s\S]*model_provider\?: string/)
  assert.match(page, /adminApi\.listModelProviders\(true\)/)
  assert.match(page, /model_provider_id/)
  assert.match(page, /<NativeSelect[^>]*value=\{String\(form\.model_provider_id/)
  assert.doesNotMatch(page, /<datalist id="model-provider-options">/)
  assert.doesNotMatch(page, /<TableHead>企业<\/TableHead>/)
  assert.match(page, /<TableCell[^>]*><div className="flex[^>]*"><span[^>]*>\{group\.name\}<\/span><Badge[^>]*>\{group\.model_provider/)
  assert.match(page, /channel\.model_provider_id/)
})
