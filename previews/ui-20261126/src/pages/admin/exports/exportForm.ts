export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export type ExportForm = { name: string; type: string }

export const initialExportForm: ExportForm = { name: '', type: 'transactions' }

export const EXPORT_TYPES = [
  { value: 'transactions', label: '账单流水' },
  { value: 'users', label: '用户列表' },
  { value: 'llm_logs', label: '调用日志' },
  { value: 'payments', label: '充值订单' },
]

/** Falls back to the raw code for a type this page does not know. */
export function typeLabel(type?: string) {
  return EXPORT_TYPES.find((item) => item.value === type)?.label ?? type ?? '-'
}

export function statusTone(status?: string): Tone {
  if (status === 'done') return 'success'
  if (status === 'running') return 'info'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export function statusLabel(status?: string) {
  if (status === 'done') return '完成'
  if (status === 'running') return '处理中'
  if (status === 'failed') return '失败'
  return '排队中'
}

export function fileSize(bytes?: number) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
