import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('admin settings validates, saves, and immediately applies the brand theme', async () => {
  const [page, field] = await Promise.all([
    source('src/pages/admin/AdminSettingsPage.tsx'),
    source('src/components/shared/ThemeColorField.tsx'),
  ])

  assert.match(page, /ThemeColorField/)
  assert.match(page, /const \{ updateThemeColor \} = useSiteSettings\(\)/)
  assert.match(page, /isThemeColorValueValid\(form\.theme_color \?\? ''\)/)
  assert.match(page, /disabled=\{saving \|\| loading \|\| !themeColorValid \|\| !exchangeRateValid\}/)
  assert.match(page, /await adminApi\.updateSettings\(payload\)[\s\S]*updateThemeColor\(form\.theme_color \?\? ''\)/)
  assert.match(page, /value=\{form\.theme_color \?\? ''\}/)

  assert.match(field, /选择主题颜色/)
  assert.match(field, /主题色号/)
  assert.match(field, /推荐颜色/)
  assert.match(field, /恢复默认/)
  assert.match(field, /isThemeColorValueValid/)
})
