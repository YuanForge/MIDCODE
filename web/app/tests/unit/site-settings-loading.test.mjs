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
