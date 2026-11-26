import { adminApi, type AdminChannelHealthRow, type AdminKeyPoolStock } from '@/lib/api/admin'

/** One thing an operator may have to handle. A null count could not be read: it is unknown, which is not the same as none. */
export type PendingItem = {
  key: string
  name: string
  unit: string
  count: number | null
  /** One sentence about what is waiting. Empty when the count could not be read. */
  detail: string
  /** The admin page where it is handled, and what the button that leads there says. */
  to: string
  action: string
}

type Source = Pick<PendingItem, 'key' | 'name' | 'unit' | 'to' | 'action'> & {
  /** What the rail asks for before it lists that page (PERMISSION_REQUIRED in AdminLayout). */
  permission: string
  load: () => Promise<Pick<PendingItem, 'count' | 'detail'>>
}

/**
 * When a channel counts as failing: over the last hour it finished at least `minCalls` calls, and at least `rate`
 * percent of them did not end as ok. The floor on calls keeps one failed call on a quiet channel from raising a flag.
 * The row says the rule in words, so the number is never a mystery.
 */
export const FAILING = { windowMinutes: 60, minCalls: 10, rate: 20 } as const

/** A key pool is low when an active channel draws from it and fewer than this many of its keys are switched on. */
export const LOW_KEYS = 3

/** How many names a row spells out before it only says how many more there are. */
const NAMED = 2

/** Longest name a row prints in full. Names are free text and some run to a sentence, so a longer one is cut. */
const NAME_MAX = 24

/** A name set off in corner brackets, so it cannot run into the words around it. */
function quote(name: string) {
  const chars = Array.from(name.trim())
  return `「${chars.length > NAME_MAX ? `${chars.slice(0, NAME_MAX).join('')}…` : chars.join('')}」`
}

/** Micro-credits as yuan inside a sentence: thousands grouped, two decimals at least and four at most. */
function sentenceYuan(micro: number) {
  return (micro / 1_000_000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** A count the server really sent. A missing field or an empty answer is a failed read, not a zero. */
function readCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('count missing')
  return value
}

/** A list the server really sent. An answer without it is a failed read, not an empty list. */
function readList<T>(value: T[] | undefined) {
  if (!Array.isArray(value)) throw new Error('list missing')
  return value
}

function named(parts: string[]) {
  const shown = parts.slice(0, NAMED).join('、')
  return parts.length > NAMED ? `${shown}，另有 ${parts.length - NAMED} 个` : shown
}

async function loadFailingChannels() {
  const res = await adminApi.getChannelHealthSummary(FAILING.windowMinutes)
  // A channel that was switched off after it failed has already been dealt with.
  const failing = readList<AdminChannelHealthRow>(res.channels)
    .filter((row) => row.is_active !== false && (row.total ?? 0) >= FAILING.minCalls && (row.failure_rate ?? 0) >= FAILING.rate)
    .sort((a, b) => (b.failure_rate ?? 0) - (a.failure_rate ?? 0))
  const parts = failing.map(
    (row) => `${quote(row.name?.trim() || `#${row.channel_id ?? '?'}`)}${Math.round(row.failure_rate ?? 0)}%（${row.total} 次中 ${row.failed ?? 0} 次失败）`,
  )
  return { count: failing.length, detail: `近 ${FAILING.windowMinutes} 分钟失败率不低于 ${FAILING.rate}%：${named(parts)}。` }
}

async function loadLowPools() {
  const res = await adminApi.getKeyPoolSummary()
  // A pool no active channel draws from serves nobody, however few keys it has.
  const low = readList<AdminKeyPoolStock>(res.pools)
    .filter((row) => row.is_active !== false && (row.channels_in_use ?? 0) > 0 && typeof row.active_keys === 'number' && row.active_keys < LOW_KEYS)
    .sort((a, b) => (a.active_keys ?? 0) - (b.active_keys ?? 0))
  const parts = low.map((row) => {
    const name = quote(row.name?.trim() || `#${row.id ?? '?'}`)
    return row.active_keys ? `${name}剩 ${row.active_keys} 个` : `${name}已没有可用 Key`
  })
  return { count: low.length, detail: `可用 Key 少于 ${LOW_KEYS} 个的在用号池：${named(parts)}。` }
}

/** How long ago `since` was, in the two largest units that matter to someone waiting. Empty when it cannot be told. */
function waited(since: string | undefined, now = Date.now()) {
  const from = since ? Date.parse(since) : Number.NaN
  if (!Number.isFinite(from) || from > now) return ''
  const minutes = Math.floor((now - from) / 60_000)
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return hours % 24 ? `${Math.floor(hours / 24)} 天 ${hours % 24} 小时` : `${Math.floor(hours / 24)} 天`
}

async function loadWithdrawals() {
  // The count endpoint, not the review list: every row of the list carries a snapshot of its payment QR code,
  // which can weigh a few hundred kilobytes, and the workbench is the first page every operator opens.
  const res = await adminApi.getPendingWithdrawCount()
  const count = readCount(res.count)
  // The total and the oldest request are extras: the server leaves out whichever it could not read.
  const total = typeof res.total_amount === 'number' ? `合计 ¥${sentenceYuan(res.total_amount)}` : ''
  const wait = waited(res.oldest_at)
  const detail = total && wait ? `${total}，最早一笔已等待 ${wait}。` : total ? `${total}，等待客服初审或财务复审。` : '等待客服初审或财务复审。'
  return { count, detail }
}

// Listed by urgency: a channel that is failing now, then a pool about to run dry, then people waiting for money.
// Only what an operator can act on, and what the backend can count in one request, is listed.
// Not here, on purpose: unpaid top-up orders. The backend cannot tell an order whose payment callback was lost from
// one the person abandoned, so the count would mostly be orders nobody can act on, and the list would never be empty.
const SOURCES: Source[] = [
  { key: 'channels', name: '渠道异常', unit: '个', to: '/admin/channels', action: '去查看', permission: 'channels:read', load: loadFailingChannels },
  { key: 'key-pools', name: '号池余量低', unit: '个', to: '/admin/key-pools', action: '去补充', permission: 'keypools:read', load: loadLowPools },
  { key: 'withdrawals', name: '待审核提现', unit: '笔', to: '/admin/withdraw', action: '去审核', permission: 'withdraw:read', load: loadWithdrawals },
]

/** How many rows the loading state stands in for. On most days few sources have anything waiting, so it is not one per source. */
export const PENDING_PLACEHOLDERS = Math.min(SOURCES.length, 2)

const describe = ({ key, name, unit, to, action }: Source) => ({ key, name, unit, to, action })
const unread = (source: Source): PendingItem => ({ ...describe(source), count: null, detail: '' })

/**
 * Reads every source whose page the signed-in admin can open, each on its own, so one failed request leaves the
 * others standing. A source whose page the rail hides from this admin is neither requested nor shown. It never
 * rejects: whatever cannot be read comes back as an unread item, so a failure is never mistaken for nothing waiting.
 */
export async function loadPending(): Promise<PendingItem[]> {
  let permissions: string[] | undefined
  try {
    permissions = (await adminApi.getAdminMe()).permissions
  } catch {
    // Left undefined: handled below, together with an answer that carries no permissions.
  }
  // Without the permissions no source can be ruled out, so each keeps its row and says it could not be read.
  if (!Array.isArray(permissions)) return SOURCES.map(unread)
  const granted = permissions
  const allowed = SOURCES.filter((source) => granted.includes('*') || granted.includes(source.permission))
  return Promise.all(
    allowed.map(async (source) => {
      try {
        return { ...describe(source), ...(await source.load()) }
      } catch {
        return unread(source)
      }
    }),
  )
}
