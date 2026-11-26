export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const PAGE_SIZE = 20

export type PaymentFilterState = {
  status: string
  email: string
  channel: string
  startAt: string
  endAt: string
}

export const emptyFilters: PaymentFilterState = { status: '', email: '', channel: '', startAt: '', endAt: '' }

export const STATUS_OPTIONS = [
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'failed', label: '失败' },
  { value: 'refunded', label: '已退款' },
]

export const CHANNEL_OPTIONS = [
  { value: 'card', label: '卡密兑换' },
  { value: 'epay', label: 'Epay' },
  { value: 'wechat', label: '微信支付' },
  { value: 'alipay', label: '支付宝' },
  { value: 'shouqianba_wechat', label: '收钱吧微信' },
  { value: 'shouqianba_alipay', label: '收钱吧支付宝' },
]

/** A redeemed card counts as settled: the money came in when the card was sold. */
export function statusTone(status?: string, source?: string): Tone {
  if (source === 'card' || status === 'paid') return 'success'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export function statusLabel(status?: string, source?: string) {
  if (source === 'card') return '已兑换'
  if (status === 'paid') return '已支付'
  if (status === 'failed') return '失败'
  if (status === 'refunded') return '已退款'
  return '待支付'
}

export function sourceLabel(source?: string) {
  return source === 'card' ? '卡密兑换' : '在线充值'
}

export function payChannelLabel(channel?: string, payFlat?: number) {
  const known = CHANNEL_OPTIONS.find((item) => item.value === channel)
  if (known) return known.label
  if (payFlat === 1) return '微信支付'
  if (payFlat === 2) return '支付宝'
  return channel || '-'
}

export function payFromLabel(payFrom?: string) {
  if (payFrom === 'pc') return 'PC'
  if (payFrom === 'wap') return '移动端'
  if (payFrom === 'wapwx') return '微信内'
  if (payFrom === 'redeem') return '兑换'
  return payFrom || '-'
}

export function formatMoney(value?: number, digits = 4) {
  return `¥${(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function apiDateTime(value: string) {
  if (!value) return ''
  return value.length === 16 ? `${value.replace('T', ' ')}:00` : value.replace('T', ' ')
}

/** Only filters that were filled in go into the request. */
export function buildPaymentParams(filters: PaymentFilterState, page: number) {
  const params: Record<string, unknown> = { page, size: PAGE_SIZE }
  if (filters.status) params.status = filters.status
  if (filters.email.trim()) params.email = filters.email.trim()
  if (filters.channel) params.pay_channel = filters.channel
  if (filters.startAt) params.start_at = apiDateTime(filters.startAt)
  if (filters.endAt) params.end_at = apiDateTime(filters.endAt)
  return params
}
