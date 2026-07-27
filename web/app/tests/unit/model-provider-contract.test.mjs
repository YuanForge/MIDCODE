import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const api = await readFile(new URL('../../src/lib/api/admin.ts', import.meta.url), 'utf8')
const router = await readFile(new URL('../../src/app/router.tsx', import.meta.url), 'utf8')
const nav = await readFile(new URL('../../src/layouts/ConsoleLayout.tsx', import.meta.url), 'utf8')
const permissions = await readFile(new URL('../../src/layouts/AdminLayout.tsx', import.meta.url), 'utf8')
const groupsPage = await readFile(new URL('../../src/pages/admin/AdminModelGroupsPage.tsx', import.meta.url), 'utf8')
const channelsPage = await readFile(new URL('../../src/pages/admin/AdminChannelsPage.tsx', import.meta.url), 'utf8')
const modelGroup = await readFile(new URL('../../../../internal/model/model_group.go', import.meta.url), 'utf8')
const channel = await readFile(new URL('../../../../internal/model/channel.go', import.meta.url), 'utf8')
let page = ''
let migration = ''
try {
  page = await readFile(new URL('../../src/pages/admin/AdminModelProvidersPage.tsx', import.meta.url), 'utf8')
} catch {
  page = ''
}
try {
  migration = await readFile(new URL('../../../../scripts/migrate_20260727_model_providers.sql', import.meta.url), 'utf8')
} catch {
  migration = ''
}

test('admin API exposes the model provider catalog and management endpoints', () => {
  assert.match(api, /export type AdminModelProvider = \{[\s\S]*code\?: string[\s\S]*name\?: string[\s\S]*is_active\?: boolean[\s\S]*sort_order\?: number[\s\S]*group_count\?: number[\s\S]*channel_count\?: number/)
  assert.match(api, /listModelProviders:[\s\S]*http\.get<[^>]+>\('\/admin\/model-providers'/)
  assert.match(api, /createModelProvider:[\s\S]*http\.post<AdminModelProvider>\('\/admin\/model-providers'/)
  assert.match(api, /updateModelProvider:[\s\S]*http\.put<AdminModelProvider>\(`\/admin\/model-providers\/\$\{id\}`/)
  assert.match(api, /toggleModelProvider:[\s\S]*http\.patch[^\n]+`\/admin\/model-providers\/\$\{id\}\/toggle`/)
  assert.match(api, /deleteModelProvider:[\s\S]*http\.delete[^\n]+`\/admin\/model-providers\/\$\{id\}`/)
})

test('model provider management is routed and permission-filtered with channel administration', () => {
  assert.match(router, /AdminModelProvidersPage/)
  assert.match(router, /path: 'model-providers', element: renderLazy\(<AdminModelProvidersPage \/>\)/)
  assert.match(nav, /label: '模型企业', href: '\/admin\/model-providers'/)
  assert.match(permissions, /'\/admin\/model-providers':\s+'channels:read'/)
})

test('model provider page manages lifecycle and explains disable impact', () => {
  assert.match(page, /新建企业/)
  assert.match(page, /编辑企业/)
  assert.match(page, /group_count/)
  assert.match(page, /channel_count/)
  assert.match(page, /新请求将立即停止使用该企业/)
  assert.match(page, /toggleModelProvider/)
  assert.match(page, /deleteModelProvider/)
  assert.match(page, /disabled=\{hasReferences/)
})

test('model groups and channels select provider IDs from the shared catalog', () => {
  for (const source of [groupsPage, channelsPage]) {
    assert.match(source, /adminApi\.listModelProviders\(true\)/)
    assert.match(source, /model_provider_id/)
  }
  assert.doesNotMatch(groupsPage, /<datalist id="model-provider-options">/)
  assert.doesNotMatch(channelsPage, /value=\{form\.model_provider\}/)
  assert.match(groupsPage, /provider\.is_active !== false/)
  assert.match(channelsPage, /provider\.is_active !== false/)
  assert.match(groupsPage, /providerLocked/)
  assert.match(groupsPage, /NativeSelect[^>]*id="group-model-provider"[^>]*disabled=\{providerLocked\}/)
  assert.match(groupsPage, /已有模型绑定，需先清空绑定才能更换企业/)
})

test('model provider migration audits legacy data before enforcing references', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS model_providers/i)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS model_provider_id BIGINT(?!\s+NOT NULL)/i)
  assert.match(migration, /VALUES\s*\([\s\S]*'openai'[\s\S]*'OpenAI'[\s\S]*'anthropic'[\s\S]*'Anthropic'/i)
  assert.match(migration, /LOWER\(code\)/i)
  assert.match(migration, /LOWER\(BTRIM\(name\)\)/i)
  assert.match(migration, /blank_[a-z_]+[\s\S]*provider_collisions[\s\S]*unresolved_[a-z_]+[\s\S]*mismatched_[a-z_]+[\s\S]*cross_provider_models/i)
  assert.match(migration, /RAISE EXCEPTION[\s\S]*model provider audit failed/i)
  assert.match(migration, /ALTER COLUMN model_provider_id SET NOT NULL/i)
  assert.match(migration, /FOREIGN KEY \(model_provider_id\)[\s\S]*REFERENCES model_providers\s*\(id\)[\s\S]*ON DELETE RESTRICT/i)
  assert.doesNotMatch(migration, /DROP COLUMN\s+model_provider/i)
})

test('Sync2 leaves provider IDs nullable until the explicit audited migration runs', () => {
  assert.match(modelGroup, /ModelProviderID int64\s+`xorm:"'model_provider_id'"/)
  assert.match(channel, /ModelProviderID int64\s+`xorm:"'model_provider_id'"/)
})
