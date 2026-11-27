import type { UserTask } from '@/lib/api/user'
import type { CreationMode, ReusePayload } from './types'
import { collectImageSources, pickVideoUrl } from './media'

export type HistoryView = {
  key: string
  mode: CreationMode
  thumbnail: string
  videoUrl: string
  prompt: string
  date: string
  reuse: ReusePayload
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringList(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string').join('\n')
  if (typeof value === 'string') return value
  return ''
}

export function toHistoryView(task: UserTask, mode: CreationMode): HistoryView | null {
  const req = task.request ?? {}
  const prompt = asString(req.prompt) ?? ''
  const date = task.created_at ? new Date(task.created_at).toLocaleString('zh-CN') : ''
  const key = String(task.task_id ?? task.id ?? prompt.slice(0, 16))

  if (mode === 'image') {
    const thumbnail = collectImageSources(task.url, task.result?.data, task.result?.urls, task.result?.url)[0] ?? ''
    if (!thumbnail) return null
    return {
      key,
      mode,
      thumbnail,
      videoUrl: '',
      prompt,
      date,
      reuse: {
        mode: 'image',
        prompt,
        image: {
          size: asString(req.size) ?? '1k',
          aspectRatio: asString(req.aspect_ratio) ?? '1:1',
          referenceImages: asStringList(req.refer_images),
        },
      },
    }
  }

  const videoUrl = pickVideoUrl(task.url, task.result?.url, task.result?.items, task.items)
  if (!videoUrl) return null
  return {
    key,
    mode,
    thumbnail: '',
    videoUrl,
    prompt,
    date,
    reuse: {
      mode: 'video',
      prompt,
      video: {
        size: asString(req.size) ?? '720p',
        aspectRatio: asString(req.aspect_ratio) ?? '16:9',
        duration: asString(req.duration) ?? String(req.duration ?? '5'),
        referenceImages: asStringList(req.refer_images),
        referenceVideos: asStringList(req.refer_videos),
      },
    },
  }
}
