import { expect, test, type Page } from '@playwright/test'

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const groups = [
  { id: 1, code: 'gpt-k12', name: 'GPT K12', model_provider_id: 10, model_provider: 'OpenAI', model_provider_active: true, model_provider_sort_order: 20, model_count: 2, is_active: true },
  { id: 2, code: 'gpt-plus', name: 'GPT Plus', model_provider_id: 10, model_provider: 'OpenAI', model_provider_active: true, model_provider_sort_order: 20, model_count: 4, is_active: true },
  { id: 3, code: 'claude', name: 'Claude', model_provider_id: 20, model_provider: 'Anthropic', model_provider_active: true, model_provider_sort_order: 30, model_count: 3, is_active: true },
]

const RAW = 'sk-mc-0123456789abcdef0123456789abcdef0123456789ab'
const LONG_NAME = '给市场部做活动海报批量出图用的密钥-名称特别长-用来看表格里会不会把后面几列挤出屏幕-2026Q4'

const bindings = (ids: number[]) => ids.map((id, priority) => ({ group_id: id, priority, group: groups.find((group) => group.id === id) }))

const keys = [
  { id: 10, name: LONG_NAME, key_prefix: 'sk-mc-012345', raw_key: RAW, viewable: true, is_active: true, last_used_at: new Date(Date.now() - 6 * 60_000).toISOString(), model_groups: bindings([1, 2]) },
  // Created before plaintext was kept: only the prefix is known, so it cannot be copied.
  { id: 11, name: '旧版密钥', key_prefix: 'a96acfa2223f', raw_key: '', viewable: false, is_active: true, last_used_at: null, model_groups: bindings([1]) },
  { id: 12, name: '只用 Claude 的密钥', key_prefix: 'bb01cc02dd03', raw_key: '', viewable: false, is_active: true, last_used_at: null, model_groups: bindings([3]) },
]

/** The key page with two keys. Every save of key 10's groups lands in `sent`, and `answer` says how the server replies to it. */
async function openKeys(page: Page, answer: (attempt: number) => Promise<ReturnType<typeof json>> = async () => json({ groups: [] })) {
  const sent: Array<Record<string, unknown>> = []
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/public/settings', (route) => route.fulfill(json({ settings: { site_name: 'MidCode', logo_url: '' } })))
  await page.route('**/api/user/model-groups', (route) => route.fulfill(json({ groups })))
  await page.route('**/api/user/apikeys**', async (route) => {
    const request = route.request()
    if (request.method() === 'PUT' && new URL(request.url()).pathname.endsWith('/10/model-groups')) {
      sent.push(request.postDataJSON() as Record<string, unknown>)
      return route.fulfill(await answer(sent.length))
    }
    return route.fulfill(json({ api_keys: keys }))
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/keys')
  return sent
}

test('a long name and key cannot push the actions out of view, and a readable key copies in full', async ({ page }) => {
  await openKeys(page)
  const table = page.getByRole('table')
  const row = table.getByRole('row').filter({ hasText: '给市场部做活动' })

  // The name is cut to one line, with the last use under it. The key shows its head and tail.
  const name = row.getByTitle(LONG_NAME, { exact: true })
  await expect(name).toBeVisible()
  expect(await name.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
  await expect(row.getByText(/最近使用 \d{2}\/\d{2} \d{2}:\d{2}/)).toBeVisible()
  await expect(row.getByText('sk-mc-0123…89ab', { exact: true })).toBeVisible()
  await expect(row.getByText(RAW)).toHaveCount(0)

  // Nothing is scrolled out of the table, and the delete button is the last thing in the row, inside the window.
  const overflow = await table.evaluate((node) => (node.parentElement?.scrollWidth ?? 0) - (node.parentElement?.clientWidth ?? 0))
  expect(overflow).toBeLessThanOrEqual(0)
  const box = await row.getByRole('button', { name: '删除' }).boundingBox()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1440)

  // One click copies the whole key, not the shortened text.
  await row.getByRole('button', { name: `复制密钥 ${LONG_NAME}` }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(RAW)

  // A key whose plaintext was never kept shows its prefix, says so, and offers no copy button.
  const legacy = table.getByRole('row').filter({ hasText: '旧版密钥' })
  await expect(legacy.getByText('a96acfa2223f…', { exact: true })).toBeVisible()
  await expect(legacy.getByText('无法复制')).toBeVisible()
  await expect(legacy.getByRole('button', { name: /复制密钥/ })).toHaveCount(0)
  await expect(legacy.getByText('从未使用')).toBeVisible()
})

test('the groups of a key can be added and removed, and a failed save stays in the dialog', async ({ page }) => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const sent = await openKeys(page, async (attempt) => {
    if (attempt === 1) return json({ error: '分组暂时不可用' }, 400)
    await gate
    return json({ groups: [] })
  })

  await page.getByRole('row').filter({ hasText: '给市场部做活动' }).getByRole('button', { name: '修改分组' }).click()
  const dialog = page.getByRole('dialog')
  const save = dialog.getByRole('button', { name: '保存', exact: true })
  await expect(dialog.getByRole('heading', { name: '修改模型分组' })).toBeVisible()

  // Nothing has changed yet, so there is nothing to save.
  await expect(save).toBeDisabled()

  // A key keeps at least one group.
  await dialog.getByLabel('gpt-k12').uncheck()
  await dialog.getByLabel('gpt-plus').uncheck()
  await expect(dialog.getByText('至少保留一个模型分组。')).toBeVisible()
  await expect(save).toBeDisabled()

  // Dropping one group is a change. The server refuses it, and the reason shows in the dialog, which stays open.
  await dialog.getByLabel('gpt-plus').check()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(dialog.getByRole('alert')).toHaveText('分组暂时不可用')
  await expect(dialog).toBeVisible()
  expect(sent).toEqual([{ group_ids: [2] }])

  // Sent again, the request is in flight: the dialog cannot be dismissed until it is answered.
  await save.click()
  await expect(dialog.getByRole('button', { name: '保存中…' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '取消' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  release()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent).toEqual([{ group_ids: [2] }, { group_ids: [2] }])
})

test('the group editor opens on the provider the key already uses', async ({ page }) => {
  await openKeys(page)
  await page.getByRole('row').filter({ hasText: '只用 Claude 的密钥' }).getByRole('button', { name: '修改分组' }).click()
  const dialog = page.getByRole('dialog')
  // OpenAI is listed first, but this key has nothing there: the editor starts where its group is ticked.
  await expect(dialog.getByRole('tab', { name: /^Anthropic/ })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByLabel('claude', { exact: true })).toBeChecked()
})

test('a long key name is cut in the dialog text', async ({ page }) => {
  await openKeys(page)
  await page.getByRole('row').filter({ hasText: '给市场部做活动' }).getByRole('button', { name: '修改分组' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(`「${Array.from(LONG_NAME).slice(0, 20).join('')}…」`)
  await expect(dialog).not.toContainText(LONG_NAME)
})
