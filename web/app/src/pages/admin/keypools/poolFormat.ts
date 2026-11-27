import type { AdminChannel, AdminKeyPool } from '@/lib/api/admin'

export function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

/** How many channels a pool serves; older rows carry a single channel_id instead of a list. */
export function boundCount(pool: AdminKeyPool) {
  return pool.channel_ids?.length ?? (pool.channel_id ? 1 : 0)
}

export function channelLabel(channel: AdminChannel) {
  return `${channel.name ?? '未命名渠道'} · ${channel.type ?? 'unknown'} · #${channel.id}`
}

export function boundChannelLabel(channel: AdminChannel) {
  return `${channel.name ?? '-'} · ${channel.model ?? '-'} · #${channel.id}`
}

/** Keys are pasted one per line or separated by commas; blanks are dropped. */
export function parseKeyLines(text: string) {
  return text
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean)
}
