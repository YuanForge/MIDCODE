import type { CreationMode } from './constants'

export type { CreationMode }

export type TaskStatus = 'idle' | 'polling' | 'done' | 'failed'

/** 图片/视频生成接口的返回结构（尽量宽松，兼容多家上游） */
export type GenerateResponse = {
  task_id?: number | string
  status?: string | number
  msg?: string
  error_msg?: string
  url?: unknown
  urls?: unknown
  items?: unknown[]
  data?: Array<{ url?: unknown }>
  result?: Record<string, unknown>
}

/** 图片模式参数 */
export type ImageParamsState = {
  size: string
  aspectRatio: string
  referenceImages: string
}

/** 视频模式参数 */
export type VideoParamsState = {
  size: string
  aspectRatio: string
  duration: string
  referenceImages: string
  referenceVideos: string
}

/** 续作来源：从图片结果「做成视频」时带入 */
export type CarryOver = {
  prompt: string
  imageUrl: string
}

export type ReusePayload = {
  mode: CreationMode
  prompt: string
  image?: Partial<ImageParamsState>
  video?: Partial<VideoParamsState>
}
