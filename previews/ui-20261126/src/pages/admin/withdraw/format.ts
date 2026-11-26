import type { AdminWithdrawal } from '@/lib/api/admin'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const PAGE_SIZE = 20

/** Withdrawal amounts arrive in millionths of a yuan. */
export function formatAmount(amount?: number) {
  return `¥${((amount ?? 0) / 1_000_000).toFixed(4)}`
}

export function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

export function statusTone(status?: string): Tone {
  if (status === 'pending') return 'warning'
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'neutral'
}

export function statusLabel(status?: string) {
  if (status === 'pending') return '待审核'
  if (status === 'approved') return '已通过'
  if (status === 'rejected') return '已拒绝'
  return status ?? '-'
}

export function stageTone(stage?: string): Tone {
  if (stage === 'cs_review') return 'warning'
  if (stage === 'finance_review') return 'info'
  if (stage === 'completed') return 'success'
  return 'neutral'
}

/** Empty string for a stage the page does not know, so the cell can show a dash instead of a raw code. */
export function stageLabel(stage?: string) {
  if (stage === 'cs_review') return '客服初审'
  if (stage === 'finance_review') return '财务复审'
  if (stage === 'completed') return '已完结'
  return ''
}

export function payTypeLabel(type?: string) {
  if (type === 'wechat') return '微信'
  if (type === 'alipay') return '支付宝'
  return type ?? '-'
}

export function canCsReview(row: AdminWithdrawal) {
  return row.status === 'pending' && (row.review_stage === 'cs_review' || !row.review_stage)
}

export function canFinanceReview(row: AdminWithdrawal) {
  return row.status === 'pending' && row.review_stage === 'finance_review'
}
