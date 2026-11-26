import type { AdminLog } from '@/lib/api/admin'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const PAGE_SIZE = 20

export type LogFilterState = {
  model: string
  user_id: string
  channel_id: string
  api_key_id: string
  status: string
  corr_id: string
  startAt: string
  endAt: string
}

export const emptyFilters: LogFilterState = {
  model: '',
  user_id: '',
  channel_id: '',
  api_key_id: '',
  status: '',
  corr_id: '',
  startAt: '',
  endAt: '',
}

export const STATUS_OPTIONS = [
  { value: 'ok', label: '成功 (ok)' },
  { value: 'error', label: '失败 (error)' },
  { value: 'refunded', label: '已退款 (refunded)' },
  { value: 'pending', label: '进行中 (pending)' },
]

export function statusTone(status?: string): Tone {
  if (status === 'ok') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'refunded') return 'warning'
  if (status === 'pending') return 'info'
  return 'neutral'
}

export function statusLabel(status?: string) {
  if (status === 'ok') return '成功'
  if (status === 'error') return '失败'
  if (status === 'refunded') return '已退款'
  if (status === 'pending') return '进行中'
  return status ?? '-'
}

export function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

/** Only filters that were filled in go into the request. */
export function buildLogParams(filters: LogFilterState, page: number) {
  const params: Record<string, unknown> = { page, page_size: PAGE_SIZE }
  if (filters.model) params.model = filters.model
  if (filters.user_id) params.user_id = filters.user_id
  if (filters.channel_id) params.channel_id = filters.channel_id
  if (filters.api_key_id) params.api_key_id = filters.api_key_id
  if (filters.status) params.status = filters.status
  if (filters.corr_id) params.corr_id = filters.corr_id
  if (filters.startAt) params.start_at = new Date(filters.startAt).toISOString()
  if (filters.endAt) params.end_at = new Date(filters.endAt).toISOString()
  return params
}

/** What the platform kept from one call: credits charged minus upstream cost. Null when neither is known. */
export function profitOf(log: AdminLog): number | null {
  const charged = log.credits_charged ?? 0
  const cost = log.cost_charged ?? 0
  if (!charged && !cost) return null
  return charged - cost
}
