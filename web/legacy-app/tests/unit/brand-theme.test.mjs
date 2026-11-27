import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadThemeModule() {
  const sourceUrl = new URL('../../src/lib/brand-theme.ts', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourceUrl.pathname,
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

test('brand theme accepts only controlled hex colors', async () => {
  const { normalizeBrandColor } = await loadThemeModule()

  assert.equal(normalizeBrandColor('#2563eb'), '#2563eb')
  assert.equal(normalizeBrandColor('  #0af  '), '#00aaff')
  assert.equal(normalizeBrandColor('rgb(0, 0, 0)'), null)
  assert.equal(normalizeBrandColor('#fff; color: red'), null)
  assert.equal(normalizeBrandColor('#12345678'), null)
  assert.equal(normalizeBrandColor(''), null)
})

test('generated light and dark brand tokens meet contrast requirements', async () => {
  const { buildBrandTheme, getContrastRatio } = await loadThemeModule()

  for (const color of ['#2563eb', '#facc15', '#111827', '#ffffff']) {
    const variables = buildBrandTheme(color)
    assert.ok(variables)

    assert.ok(getContrastRatio(variables['--brand-primary'], variables['--brand-primary-foreground']) >= 4.5)
    assert.ok(getContrastRatio(variables['--brand-primary-dark'], variables['--brand-primary-foreground-dark']) >= 4.5)
    assert.ok(getContrastRatio(variables['--brand-primary'], '#f5f6f9') >= 3)
    assert.ok(getContrastRatio(variables['--brand-primary-dark'], '#0e1013') >= 3)
    assert.ok(getContrastRatio(variables['--brand-accent'], variables['--brand-accent-foreground']) >= 4.5)
    assert.ok(getContrastRatio(variables['--brand-accent-dark'], variables['--brand-accent-foreground-dark']) >= 4.5)
  }
})

test('brand theme only controls brand tokens and clears safely', async () => {
  const { BRAND_THEME_VARIABLES, applyBrandTheme } = await loadThemeModule()
  const values = new Map()
  const root = {
    dataset: {},
    style: {
      setProperty: (name, value) => values.set(name, value),
      removeProperty: (name) => values.delete(name),
    },
  }

  assert.ok(BRAND_THEME_VARIABLES.length > 0)
  assert.ok(BRAND_THEME_VARIABLES.every((name) => name.startsWith('--brand-')))
  assert.ok(BRAND_THEME_VARIABLES.every((name) => !/(?:success|warning|destructive|danger)/.test(name)))

  applyBrandTheme({ themeColor: '#2563eb' }, root)
  assert.equal(values.size, BRAND_THEME_VARIABLES.length)
  assert.equal(root.dataset.brandTheme, '#2563eb')

  applyBrandTheme({ themeColor: 'not-a-color' }, root)
  assert.equal(values.size, 0)
  assert.equal(root.dataset.brandTheme, undefined)
})
