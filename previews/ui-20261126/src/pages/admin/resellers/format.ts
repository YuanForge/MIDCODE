export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

/** Sites and build jobs share one vocabulary: running and success are good, failed is bad, building is in flight, manual work is waiting on someone. */
export function statusTone(status?: string): Tone {
  if (status === 'running' || status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'building') return 'info'
  if (status === 'manual_ops_required') return 'warning'
  return 'neutral'
}

export function statusLabel(status?: string) {
  if (status === 'running') return '运行中'
  if (status === 'building') return '搭建中'
  if (status === 'failed') return '失败'
  if (status === 'success') return '成功'
  if (status === 'pending') return '待处理'
  if (status === 'manual_ops_required') return '待人工处理'
  return status || '-'
}
