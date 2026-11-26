import type { AdminTransaction } from '@/lib/api/admin'

export const PAGE_SIZE = 20

export type BillingFilterState = {
  startAt: string
  endAt: string
  type: string
  userId: string
  apiKeyId: string
}

export const emptyFilters: BillingFilterState = { startAt: '', endAt: '', type: '', userId: '', apiKeyId: '' }

export const TYPE_OPTIONS = [
  { value: 'settle', label: '结算' },
  { value: 'hold', label: '预扣' },
  { value: 'refund', label: '退款' },
  { value: 'recharge', label: '充值' },
  { value: 'withdraw', label: '提现' },
  { value: 'adjust', label: '调整' },
]

const TYPE_LABELS: Record<string, string> = {
  charge: '扣费',
  refund: '退款',
  recharge: '充值',
  hold: '预扣',
  settle: '结算',
  withdraw: '提现',
  adjust: '调整',
}

export function typeLabel(type?: string) {
  return TYPE_LABELS[type ?? ''] ?? type ?? '-'
}

export function isDebit(type?: string) {
  return type === 'charge' || type === 'hold' || type === 'settle'
}

export function toMoney(value?: number) {
  return (value ?? 0).toFixed(4)
}

export function formatMoney(value?: number) {
  return (value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** The server may send the profit itself; otherwise it is amount minus cost, reversed for a refund. */
export function profitOf(row: AdminTransaction) {
  if (row.profit != null) return row.profit
  const amount = row.amount ?? 0
  const cost = row.cost ?? 0
  if (row.type === 'refund') return -(amount - cost)
  if (isDebit(row.type)) return amount - cost
  return 0
}

/** Only filters that were filled in go into the request. */
export function buildBillingParams(filters: BillingFilterState, page: number) {
  const params: Record<string, unknown> = { page, size: PAGE_SIZE }
  if (filters.startAt) params.start_at = `${filters.startAt.replace('T', ' ')}:00`
  if (filters.endAt) params.end_at = `${filters.endAt.replace('T', ' ')}:00`
  if (filters.type) params.type = filters.type
  if (filters.userId) params.user_id = filters.userId
  if (filters.apiKeyId) params.api_key_id = filters.apiKeyId
  return params
}

export type Dim = 'user' | 'channel' | 'model' | 'day'

export type AggRow = { key: string; revenue: number; cost: number; profit: number; calls: number }

export const DIMS: Array<{ value: Dim; label: string; head: string }> = [
  { value: 'user', label: '按用户', head: '用户 ID' },
  { value: 'channel', label: '按渠道', head: '渠道 ID' },
  { value: 'model', label: '按模型', head: '模型' },
  { value: 'day', label: '按日', head: '日期' },
]
