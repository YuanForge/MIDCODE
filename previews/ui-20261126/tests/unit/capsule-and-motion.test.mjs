import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const src = (path) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')

async function sourceFiles(dir) {
  const root = new URL(`../../src/${dir}/`, import.meta.url)
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.(tsx|ts)$/.test(entry.name))
    .map((entry) => `${entry.parentPath ?? entry.path}/${entry.name}`)
}

test('every button size is a capsule', async () => {
  const button = await src('components/ui/button.tsx')
  const base = button.match(/const buttonVariants = cva\(\s*'([^']+)'/)?.[1] ?? ''

  assert.match(base, /\brounded-full\b/)
  // No size or variant may bring back a corner radius of its own.
  assert.doesNotMatch(button, /\brounded-(sm|md|lg|xl|2xl|3xl|none|\[)/)
})

test('controls that are pressed like a button share the capsule shape', async () => {
  const cases = [
    ['pages/admin/dashboard/Segmented.tsx', /'relative h-8 rounded-full /],
    ['pages/user/billing/PaySummary.tsx', /role='radio'[\s\S]*?rounded-full border/],
    ['layouts/shell/TopBar.tsx', /aria-label=\{commandLabel\}\s+className='[^']*\brounded-full\b/],
    ['components/shared/FilterRail.tsx', /aria-pressed=\{active\}[\s\S]*?\brounded-full\b/],
  ]
  for (const [path, pattern] of cases) {
    assert.match(await src(path), pattern, path)
  }
})

test('fields are soft rectangles next to the capsules', async () => {
  assert.match(await src('components/ui/input.tsx'), /"h-9 w-full min-w-0 rounded-2xl /)
  assert.match(await src('components/ui/textarea.tsx'), /min-h-16 w-full rounded-2xl /)
  const select = await src('components/ui/select.tsx')
  assert.equal(select.match(/"flex h-9 w-full[^"]*\brounded-2xl\b/g)?.length, 2, 'native select and select trigger')
})

test('press feedback shrinks the capsule and is dropped with reduced motion', async () => {
  const button = await src('components/ui/button.tsx')

  assert.match(button, /\[--press:0\.97\] motion-safe:active:not-aria-\[haspopup=menu\]:scale-\(--press\)/)
  assert.match(button, /transition-\[[^\]]*\bscale\b[^\]]*\] duration-140/)
  assert.match(button, /icon: 'size-9 \[--press:0\.92\]'/)
  assert.match(button, /link: '[^']*\[--press:1\]'/)
})

test('the segmented selection travels instead of repainting', async () => {
  const tabs = await src('components/ui/tabs.tsx')
  const segmented = await src('pages/admin/dashboard/Segmented.tsx')
  const hook = await src('hooks/use-sliding-indicator.ts')

  assert.match(tabs, /useSlidingIndicator\(listRef, indicatorRef, "\[data-slot=tabs-trigger\]\[data-state=active\]", segmented\)/)
  assert.match(tabs, /data-slot="tabs-indicator"/)
  // The selected tab keeps its own fill until the travelling capsule has been placed.
  assert.match(tabs, /group-data-\[variant=default\]\/tabs-list:data-active:bg-foreground\/90/)
  assert.match(tabs, /group-data-\[indicator=ready\]\/tabs-list:data-active:bg-transparent/)
  assert.match(segmented, /useSlidingIndicator\(listRef, indicatorRef, '\[aria-pressed=true\]'\)/)
  assert.match(hook, /list\.dataset\.indicator = 'ready'/)
  assert.match(hook, /delete list\.dataset\.indicator/)
})

test('arrival and disclosure motion live in the shared primitives', async () => {
  const theme = await src('styles/theme.css')
  const table = await src('components/ui/table.tsx')

  assert.match(theme, /--animate-arrive: page-enter 200ms [^;]+ backwards;/)
  assert.match(table, /'animate-arrive \[&_tr\]:h-11/)
  assert.match(await src('components/shared/TableSkeleton.tsx'), /<TableBody aria-busy="true" className="animate-none!">/)
  assert.match(await src('components/ui/select.tsx'), /data-\[state=open\]:\[&>svg\]:rotate-180/)
  assert.match(await src('layouts/shell/AccountCluster.tsx'), /group-aria-expanded\/button:rotate-180/)
  assert.match(await src('components/shared/ThemeToggle.tsx'), /document\.startViewTransition\(apply\)/)
})

test('reduced motion collapses every duration but keeps the spinner', async () => {
  const base = await src('styles/base.css')
  const block = base.slice(base.indexOf('@media (prefers-reduced-motion: reduce)'))

  assert.match(block, /\*:not\(\.animate-spin\)/)
  assert.match(block, /animation-duration: 0\.01ms !important/)
  assert.match(block, /transition-duration: 0\.01ms !important/)
})

test('consoles only loop for loading feedback', async () => {
  const allowed = new Set([
    'animate-in',
    'animate-out',
    'animate-none',
    'animate-reveal',
    'animate-arrive',
    'animate-page-enter',
    // Loading feedback is the one place a console may loop.
    'animate-spin',
    'animate-pulse',
  ])
  const dirs = ['components/ui', 'components/shared', 'layouts', 'pages/admin', 'pages/user', 'pages/vendor', 'pages/reseller']
  for (const dir of dirs) {
    for (const file of await sourceFiles(dir)) {
      const text = await readFile(file, 'utf8')
      for (const name of text.match(/\banimate-[a-z][a-z-]*/g) ?? []) {
        assert.ok(allowed.has(name), `${file} uses ${name}`)
      }
    }
  }
})
