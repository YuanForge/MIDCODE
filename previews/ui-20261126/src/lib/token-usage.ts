import type { TokenUsageRow } from '@/lib/api/user'

export const tokenSegments = [
  { key: 'non_cached_input_tokens', label: '非缓存输入', className: 'bg-chart-1' },
  { key: 'cache_read_tokens', label: '缓存读取', className: 'bg-chart-2' },
  { key: 'cache_creation_tokens', label: '缓存写入', className: 'bg-chart-4' },
  { key: 'output_tokens', label: '输出', className: 'bg-muted-foreground/45' },
] as const satisfies ReadonlyArray<{
  key: keyof TokenUsageRow
  label: string
  className: string
}>

export function formatTokenCount(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value || 0)
}

export function tokenStatsTodayRange() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { startAt: formatLocal(start), endAt: formatLocal(now) }
}

function formatLocal(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}
