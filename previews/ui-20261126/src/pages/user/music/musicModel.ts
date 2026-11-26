import type { TaskVerdict } from '@/pages/user/gen/useGenTask'

export type MusicMode = '10' | '20'

export type MusicItem = {
  audio_url?: string
  video_url?: string
  image_url?: string
  title?: string
  duration?: number | string
  tags?: string
}

export type MusicResponse = {
  task_id?: number | string
  code?: number
  status?: string | number
  msg?: string
  items?: MusicItem[]
  result?: { items?: MusicItem[] }
}

/** The songs can sit at the top level of the response or under result, depending on the channel. */
export function musicItems(data: MusicResponse): MusicItem[] {
  if (Array.isArray(data.items)) return data.items
  const nested = data.result?.items
  return Array.isArray(nested) ? nested : []
}

/** Reads one /v1/tasks/{id} response: done (with the songs), failed (with the reason), or still running. */
export function interpretMusicTask(raw: unknown): TaskVerdict<MusicItem[]> {
  const data = raw as MusicResponse
  if (data.code === 200 || data.status === 2) return { phase: 'done', result: musicItems(data) }
  if ((typeof data.code === 'number' && data.code >= 400) || data.status === 3) {
    return { phase: 'failed', message: data.msg || '生成失败' }
  }
  return { phase: 'pending' }
}
