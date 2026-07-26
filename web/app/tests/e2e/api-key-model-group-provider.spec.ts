import { expect, test } from '@playwright/test'

const groups = [
  { id: 1, code: 'gpt-k12', name: 'GPT K12', model_provider: 'OpenAI', model_count: 2, is_active: true },
  { id: 2, code: 'gpt-plus', name: 'GPT Plus', model_provider: 'OpenAI', model_count: 4, is_active: true },
  { id: 3, code: 'claude', name: 'Claude', model_provider: 'Anthropic', model_count: 3, is_active: true },
  { id: 4, code: 'claude-backup', name: 'Claude Backup', model_provider: 'Anthropic', model_count: 2, is_active: true },
]

test('selects and orders API key groups independently by model provider', async ({ page }) => {
  let createPayload: Record<string, unknown> | undefined
  let updatePayload: Record<string, unknown> | undefined

  await page.addInitScript(() => window.localStorage.setItem('token', 'mock-user-token'))
  await page.route('**/api/public/settings', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { site_name: 'MidCode', logo_url: '' } }) }),
  )
  await page.route('**/api/user/model-groups', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ groups }) }),
  )
  await page.route('**/api/user/apikeys**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'POST') {
      createPayload = request.postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'sk-created' }) })
      return
    }
    if (pathname.endsWith('/10/model-groups') && request.method() === 'PUT') {
      updatePayload = request.postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ groups: [] }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        api_keys: [{
          id: 10,
          name: 'existing-key',
          key_prefix: 'sk-test',
          is_active: true,
          model_groups: [1, 3, 2, 4].map((groupId, priority) => ({
            group_id: groupId,
            priority,
            group: groups.find((group) => group.id === groupId),
          })),
        }],
      }),
    })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/keys')
  await page.getByRole('button', { name: '新建密钥' }).click()

  await expect(page.getByRole('tab', { name: /OpenAI/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Anthropic/ })).toBeVisible()
  await page.getByLabel('gpt-k12').check()
  await page.getByLabel('gpt-plus').check()
  await page.getByRole('tab', { name: /Anthropic/ }).click()
  await page.getByLabel('claude', { exact: true }).check()
  await page.getByLabel('名称').fill('multi-provider-key')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect.poll(() => createPayload?.group_ids).toEqual([1, 2, 3])

  await page.getByRole('button', { name: '关闭' }).click()
  await page.getByRole('row').filter({ hasText: 'existing-key' }).getByRole('button', { name: '分组排序' }).click()
  await page.getByRole('tab', { name: /OpenAI/ }).click()
  await page.getByRole('button', { name: '下移 GPT K12' }).click()
  await page.getByRole('button', { name: '保存排序' }).click()
  await expect.poll(() => updatePayload?.group_ids).toEqual([2, 3, 1, 4])

  await page.getByRole('button', { name: '新建密钥' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = page.getByRole('dialog')
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 1000).toBeLessThanOrEqual(390)
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
