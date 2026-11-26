import type { AdminCleanupTarget, AdminTask } from '@/lib/api/admin'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export type Req = Record<string, unknown>

export const PAGE_SIZE = 20
export const CONFIRM_PHRASE = '确认清理'

export type TaskFilterState = {
  task_id: string
  user_id: string
  type: string
  status: string
  startAt: string
  endAt: string
}

export const emptyFilters: TaskFilterState = { task_id: '', user_id: '', type: '', status: '', startAt: '', endAt: '' }

export const TYPE_OPTIONS = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'music', label: '音乐' },
]

export const STATUS_OPTIONS = [
  { value: 'pending', label: '排队中' },
  { value: 'processing', label: '处理中' },
  { value: 'done', label: '成功' },
  { value: 'failed', label: '失败' },
]

export function statusTone(status?: string): Tone {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'processing') return 'info'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

export function statusLabel(status?: string) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status ?? '-'
}

export function typeLabel(type?: string) {
  return TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type ?? '-'
}

export function isActive(status?: string) {
  return status === 'pending' || status === 'processing'
}

export function isFinished(status?: string) {
  return status === 'done' || status === 'failed'
}

export function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

/** Only filters that were filled in go into the request. */
export function buildTaskParams(filters: TaskFilterState, page: number) {
  const params: Req = { page, size: PAGE_SIZE }
  if (filters.task_id) params.task_id = filters.task_id
  if (filters.user_id) params.user_id = filters.user_id
  if (filters.type) params.type = filters.type
  if (filters.status) params.status = filters.status
  if (filters.startAt) params.start_at = `${filters.startAt.replace('T', ' ')}:00`
  if (filters.endAt) params.end_at = `${filters.endAt.replace('T', ' ')}:00`
  return params
}

/** The three most common failure messages on this page, grouped by their first 40 characters. */
export function topErrors(tasks: AdminTask[]): Array<[string, number]> {
  const counts: Record<string, number> = {}
  for (const task of tasks) {
    if (task.status !== 'failed' || !task.error_msg) continue
    const key = task.error_msg.slice(0, 40)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
}

// The upstream request carries its own bookkeeping next to the real body; these keys are the bookkeeping.
const META_KEYS = ['_url', '_headers', '_poll_request', '_method', 'method', 'query']

export function upstreamUrl(req?: Req) {
  return req?._url as string | undefined
}

export function upstreamHeaders(req?: Req) {
  return req?._headers as Req | undefined
}

/** What was first sent to the third party: the recorded initial request, or whatever is left once the bookkeeping keys are removed. */
export function upstreamBody(req?: Req): Req | undefined {
  if (!req) return undefined
  const initial = req._initial_request
  if (initial && typeof initial === 'object') return initial as Req
  const rest = Object.fromEntries(Object.entries(req).filter(([key]) => !META_KEYS.includes(key)))
  return Object.keys(rest).length > 0 ? rest : undefined
}

export function pollBody(req?: Req): Req | undefined {
  if (!req) return undefined
  if (req._poll_request && typeof req._poll_request === 'object') return req._poll_request as Req
  const { method, query } = req
  return method || query ? { method, query } : undefined
}

export function targetLabel(target: AdminCleanupTarget) {
  return target === 'tasks' ? '历史任务' : 'LLM 调用日志'
}

export function minRetentionDays(target: AdminCleanupTarget) {
  return target === 'tasks' ? 30 : 1
}

const CLEANUP_STATUS: Record<string, string> = { done: '成功', failed: '失败', ok: '成功', error: '错误', refunded: '已退款' }

export function cleanupStatusText(status: string) {
  return CLEANUP_STATUS[status] ?? status
}
