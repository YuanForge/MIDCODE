import type { ComponentType } from 'react'
import { ImageIcon, VideoIcon } from 'lucide-react'

export type CreationMode = 'image' | 'video'

export type ModeMeta = {
  key: CreationMode
  label: string
  icon: ComponentType<{ className?: string }>
  endpoint: string
  /** 渠道过滤：判断某渠道是否属于该模式 */
  channelMatch: (channel: { type?: string; billing_type?: string }) => boolean
  promptPlaceholder: string
}

export const MODES: ModeMeta[] = [
  {
    key: 'image',
    label: '图片',
    icon: ImageIcon,
    endpoint: '/v1/image',
    channelMatch: (c) => c.type === 'image' || c.billing_type === 'image',
    promptPlaceholder: '描述你想生成的图片内容，例如：清晨薄雾中的桂林漓江，水墨意境…',
  },
  {
    key: 'video',
    label: '视频',
    icon: VideoIcon,
    endpoint: '/v1/video',
    channelMatch: (c) => c.type === 'video',
    promptPlaceholder: '描述画面与运镜，例如：镜头缓缓推进，少女回眸一笑，背景樱花飘落…',
  },
]

export const IMAGE_SIZES = [
  { value: '1k', label: '1k (1024px)' },
  { value: '2k', label: '2k (2048px)' },
  { value: '3k', label: '3k (3072px)' },
  { value: '4k', label: '4k (4096px)' },
]

export const IMAGE_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']

export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p']
export const VIDEO_RATIOS = ['16:9', '9:16', '1:1']
export const VIDEO_DURATIONS = ['5', '10']

export const POLL_INTERVAL_MS = 3000
export const HISTORY_PAGE_SIZE = 20

/** 历史生成仅展示近 N 小时（前端口径，服务器实际保留更久） */
export const HISTORY_RETENTION_HOURS = 24
