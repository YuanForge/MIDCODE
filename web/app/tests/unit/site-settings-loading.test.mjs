import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('site settings apply configured SEO metadata with site name fallback', async () => {
  const hook = await source('src/hooks/use-site-settings.ts')
  assert.match(hook, /seoTitle: string/)
  assert.match(hook, /seoDescription: string/)
  assert.match(hook, /seo_title/)
  assert.match(hook, /seo_description/)
  assert.match(hook, /document\.title = settings\.seoTitle \|\| settings\.siteName/)
  assert.match(hook, /meta\[name="description"\]/)
})

test('application waits for one themed site settings load before rendering routes', async () => {
  const [app, hook, loadingScreen] = await Promise.all([
    source('src/app/App.tsx'),
    source('src/hooks/use-site-settings.ts'),
    source('src/components/shared/SiteLoadingScreen.tsx'),
  ])

  assert.match(app, /SiteSettingsProvider/)
  assert.match(app, /SiteSettingsGate/)
  assert.match(loadingScreen, /neutral-site-loading-screen/)
  assert.doesNotMatch(loadingScreen, /GATEWAY|LLM|IMAGE|VIDEO/)
  assert.match(hook, /status: 'loading' \| 'ready' \| 'error'/)
  assert.match(hook, /themeColor: string/)
  assert.match(hook, /getRuntimeString\('theme_color'\)/)
  assert.match(hook, /applyBrandTheme\(\{ themeColor: settings\.themeColor \}\)/)
  assert.doesNotMatch(hook, /MINIMUM_LOADING_MS/)
})
