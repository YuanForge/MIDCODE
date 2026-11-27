import type { TaskVerdict } from '@/pages/user/gen/useGenTask'

export type VideoGenerateResponse = {
  task_id?: number | string
  status?: string | number
  msg?: string
  error_msg?: string
  url?: unknown
  items?: unknown[]
  result?: Record<string, unknown>
}

export function splitLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** The backend returns the video address as a string, a list, or an object with a url, depending on the channel. */
export function pickVideoUrl(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) return item.trim()
        if (item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string') {
          return ((item as { url?: string }).url ?? '').trim()
        }
      }
    }
    if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
      return ((value as { url?: string }).url ?? '').trim()
    }
  }
  return ''
}

/** Reads one /v1/tasks/{id} response: done (with the video address), failed (with the reason), or still running. */
export function interpretVideoTask(raw: unknown): TaskVerdict<string> {
  const data = raw as VideoGenerateResponse
  if (data.status === 'done' || data.status === 2) {
    const result = data.result ?? {}
    return { phase: 'done', result: pickVideoUrl(result.url, data.url, result.items, data.items) }
  }
  if (data.status === 'failed' || data.status === 3) {
    return { phase: 'failed', message: data.error_msg ?? data.msg ?? '生成失败' }
  }
  return { phase: 'pending' }
}
