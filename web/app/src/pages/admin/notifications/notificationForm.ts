import type { AdminNotification } from '@/lib/api/admin'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export type NotificationForm = {
  title: string
  content: string
  target_type: string
  target_value: string
}

export const initialNotificationForm: NotificationForm = { title: '', content: '', target_type: 'all', target_value: '' }

export function statusTone(status?: string): Tone {
  if (status === 'sent') return 'success'
  if (status === 'sending') return 'info'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export function statusLabel(status?: string) {
  if (status === 'sent') return '已发送'
  if (status === 'sending') return '发送中'
  if (status === 'failed') return '失败'
  return '草稿'
}

export function targetLabel(item: AdminNotification) {
  if (item.target_type === 'all') return '全部用户'
  return item.target_value || item.target_type || '-'
}
