import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const src = (path) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')

test('the user console is one floating bar of seven sections', async () => {
  const shell = await src('layouts/shell/ConsoleShell.tsx')
  const nav = await src('layouts/nav-config.tsx')
  const top = await src('layouts/shell/TopNav.tsx')

  assert.match(shell, /const topNav = role === 'user'/)
  assert.match(shell, /\{topNav \? null : \(\s+<Sidebar /)
  // Section names reuse navigation names that are already translated in every language.
  assert.equal(nav.match(/\{ key: '[a-z]+', label: '[^']+', labelKey: 'layout\./g)?.length, 7)
  assert.match(top, /data-slot='top-bar' className='glass flex h-14 items-center gap-2 rounded-full! /)
  // The open section is an ink capsule that travels to the next choice.
  assert.match(top, /useSlidingIndicator\(navRef, indicatorRef, '\[data-active=true\]'\)/)
  assert.match(await src('hooks/use-sliding-indicator.ts'), /'data-active', 'aria-current'/)
})

test('back-office consoles keep an ink rail that folds and remembers it', async () => {
  const shell = await src('layouts/shell/ConsoleShell.tsx')
  const nav = await src('layouts/nav-config.tsx')

  assert.match(shell, /<Sidebar collapsible=\{role === 'admin' \? 'offcanvas' : 'icon'\} variant='floating' className='dark console-rail'>/)
  assert.match(shell, /open=\{topNav \? false : railOpen\}/)
  assert.match(shell, /window\.localStorage\.setItem\(RAIL_KEY, open \? 'open' : 'collapsed'\)/)
  // Wide administrator tables keep their width: that rail opens by default only on a wider window.
  assert.match(shell, /user: 1100, admin: 1640/)
  assert.match(shell, /tooltip=\{section\.label\}/)
  assert.equal(nav.match(/\{ key: '[a-z]+', label: '[^']+', icon: [A-Za-z]+Icon, hrefs: \[/g)?.length, 6)
  assert.match(await src('styles/console.css'), /\.console-rail \{\s+--sidebar: #14171c;/)
})

test('a section with several pages shows them as a switcher above the page', async () => {
  const shell = await src('layouts/shell/ConsoleShell.tsx')
  const switcher = await src('layouts/shell/SectionNav.tsx')

  assert.match(shell, /activeSection && activeSection\.items\.length > 1 \?/)
  assert.match(switcher, /data-slot='section-nav'/)
  assert.match(switcher, /useSlidingIndicator\(listRef, indicatorRef, '\[aria-current=page\]'\)/)
})

test('the balance rides in the bar and never shows a zero for a failed read', async () => {
  assert.match(await src('layouts/shell/TopNav.tsx'), /balance == null \? '—' : formatCredits\(balance\)/)
  assert.match(await src('layouts/shell/useBalance.ts'), /\}, \[enabled, pathname\]\)/)
  assert.doesNotMatch(await src('layouts/shell/AccountCluster.tsx'), /getBalance/)
})

test('surfaces float at three heights over a canvas with depth', async () => {
  const tokens = await src('styles/tokens.css')
  const glass = await src('styles/glass.css')
  const console_ = await src('styles/console.css')

  assert.match(tokens, /--glass-dense: /)
  assert.match(tokens, /--glass-shadow-high:/)
  assert.match(glass, /@utility glass-raised \{/)
  // Small modules repeated many times do not blur what is behind them.
  const dense = glass.match(/@utility surface-dense \{[^}]*\}/)?.[0] ?? ''
  assert.match(dense, /background: var\(--glass-dense\)/)
  assert.doesNotMatch(dense, /backdrop-filter/)
  assert.match(console_, /\.glass:has\(\[data-slot='table'\]\) \{\s+background: var\(--glass-dense\);/)
  assert.equal(console_.match(/radial-gradient\(/g)?.length, 6)
  assert.match(await src('pages/user/UserDashboardPage.tsx'), /aria-label='账户余额' className='glass-raised /)
  assert.match(await src('pages/user/models/ModelCards.tsx'), /className='surface-dense relative /)
})

test('page headings take their icon from the open navigation entry', async () => {
  assert.match(await src('components/shared/PageHeader.tsx'), /const navIcon = useContext\(PageIconContext\)/)
  assert.match(await src('layouts/shell/ConsoleShell.tsx'), /<PageIconContext\.Provider value=\{activeItem\?\.icon \?\? null\}>/)
})

test('the overview makes no request for a guest and shows dashes for a failed load', async () => {
  const page = await src('pages/user/UserDashboardPage.tsx')

  assert.match(page, /if \(!signedIn\) return EMPTY/)
  assert.match(page, /const figure = \(credits: number\) => \(failed \? '—' : formatCredits\(credits\)\)/)
  // The address people paste into a client is the OpenAI-compatible base, not the bare origin.
  assert.match(page, /const base = `\$\{origin\}\/v1`/)
})

test('a call log opens beside the table, guarded against answers that arrive out of order', async () => {
  const page = await src('pages/user/UserLogsPage.tsx')
  const detail = await src('pages/user/logs/LogDetailSheet.tsx')

  assert.match(page, /const wide = useMediaQuery\('\(min-width: 1280px\)'\)/)
  assert.match(page, /const seq = \+\+requestSeq\.current/)
  assert.equal(page.match(/if \(seq !== requestSeq\.current\) return/g)?.length, 2)
  // The error object carries the Authorization header, so only its message is kept.
  assert.doesNotMatch(page, /console\.error/)
  assert.match(page, /compact=\{inline\}/)
  // One body for both containers. How long the call took is the backend's own figure, and a dash when it sends none.
  assert.match(detail, /export function LogDetail\(/)
  assert.match(detail, /<LogDetail log=\{log\}/)
  assert.match(detail, /\{ label: '耗时', value: formatCallDuration\(log\.latency_ms\) \?\? NONE \}/)
  assert.match(detail, /charged > 0 \? `这次调用扣了 \$\{formatCredits\(charged\)\} 积分。` : '这次调用没有扣费。'/)
})

test('the workbench lists only what an operator can act on, read with one light request', async () => {
  const pending = await src('pages/admin/dashboard/pending.ts')

  assert.match(pending, /adminApi\.getPendingWithdrawCount\(\)/)
  // The review list carries a QR snapshot per row, and an unpaid order cannot be told from an abandoned one.
  assert.doesNotMatch(pending, /adminApi\.(listWithdrawals|listPaymentOrders)/)
  assert.match(pending, /if \(typeof value !== 'number' \|\| !Number\.isFinite\(value\) \|\| value < 0\) throw/)
  assert.match(await src('pages/admin/AdminDashboardPage.tsx'), /<PendingPanel \/>/)
  assert.match(await src('pages/admin/dashboard/PendingPanel.tsx'), /aria-label='待处理' className='glass-raised /)
})

test('an account opens beside the admin user table and ticked rows follow the list', async () => {
  const page = await src('pages/admin/AdminUsersPage.tsx')

  assert.match(page, /const wide = useMediaQuery\('\(min-width: 1536px\)'\)/)
  // A batch action can only reach rows that are still on the page.
  assert.match(page, /setSelected\(\(current\) => keepShown\(current, ids\)\)/)
  assert.match(await src('pages/admin/users/UserDetailDialog.tsx'), /<UserDetailBody /)
  assert.match(await src('pages/admin/users/UserDetailPanel.tsx'), /<UserDetailBody /)
})

test('the model list is a grid of compact cards with its filters in one toolbar', async () => {
  const page = await src('pages/user/UserModelsPage.tsx')
  const cards = await src('pages/user/models/ModelCards.tsx')

  assert.match(page, /<ModelCards\s+models=\{rows\}/)
  assert.match(page, /<FilterRailGroup\s+inline/)
  assert.match(cards, /data-slot='model-card'/)
  assert.match(cards, /grid-cols-\[repeat\(auto-fill,minmax\(17rem,1fr\)\)\]/)
  // The id repeats the name for most models, so it is shown only when it differs.
  assert.match(cards, /model\.modelId !== model\.name \?/)
  // The token price is two figures, and the last 60 calls are one thin line along the bottom edge.
  assert.match(cards, /data-slot='model-price'/)
  assert.match(cards, /data-slot='model-health' className='pointer-events-none absolute inset-x-0 bottom-0 flex h-\[3px\]/)
  assert.match(page, /priceLines: tokenPrice \? priceLines\.slice\(1\) : priceLines/)
  const price = await src('pages/user/models/price.ts')
  assert.match(price, /export function tidyPrice/)
  assert.match(price, /export function parseTokenPrice/)
  await assert.rejects(access(new URL('../../src/components/shared/ModelLedger.tsx', import.meta.url)))
})
