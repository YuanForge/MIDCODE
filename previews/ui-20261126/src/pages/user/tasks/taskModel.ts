import type { UserTask } from '@/lib/api/user'

export type TaskBilling = {
  transactions?: Array<{ id?: number; type?: string; credits?: number; balance_after?: number; created_at?: string }>
  net_charged?: number
  refunded?: boolean
}

/** The backend sends the state as a word or as a numeric code; this folds both into one word. */
export function resolveStatus(row: UserTask): string {
  if (typeof row.status === 'string') return row.status
  if (row.status === 0) return 'pending'
  if (row.status === 1) return 'processing'
  if (row.status === 2 || row.status === 200) return 'done'
  if (typeof row.status === 'number' && row.status < 0) return 'failed'
  return String(row.status ?? '-')
}

export function isRunning(status: string) {
  return status === 'pending' || status === 'processing'
}

const TYPE_LABELS: Record<string, string> = {
  image: '图片生成',
  video: '视频生成',
  audio: '音频生成',
  music: '音乐生成',
}

export function typeLabel(type: string | undefined) {
  return TYPE_LABELS[type ?? ''] ?? (type ?? '-')
}

function splitLines(value: unknown) {
  if (typeof value !== 'string') return []
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === 'string') return [item.trim()]
        if (item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string') {
          return [((item as { url?: string }).url ?? '').trim()]
        }
        return []
      })
      .filter(Boolean)
  }
  if (typeof value === 'string') return splitLines(value)
  return []
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function collectResultVideoUrls(task: UserTask | null) {
  if (!task) return []
  const result = task.result ?? {}
  const urls = [
    task.url,
    result.url,
    ...normalizeStringList(result.urls),
    ...normalizeStringList(result.videos),
    ...normalizeStringList(task.items),
    ...normalizeStringList(result.items),
  ]
  return Array.from(new Set(urls.filter((item): item is string => Boolean(item))))
}

export function collectReferenceImages(task: UserTask | null) {
  if (!task) return []
  return Array.from(new Set(normalizeStringList(task.request?.refer_images)))
}

export function collectReferenceVideos(task: UserTask | null) {
  if (!task) return []
  return Array.from(new Set(normalizeStringList(task.request?.refer_videos)))
}

export function hasContent(value: unknown) {
  if (!value) return false
  return !(typeof value === 'object' && Object.keys(value as object).length === 0)
}
