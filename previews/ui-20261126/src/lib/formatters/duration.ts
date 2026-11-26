/**
 * How long a call took, as the consoles show it. The server sends milliseconds but measures in whole seconds (its
 * timestamps carry no fraction), so a figure can be up to a second off. It therefore reads as an approximate number
 * of seconds or minutes, never as milliseconds: 不到 1 秒, 约 12 秒, 约 1 分 5 秒.
 * Null when there is nothing to show: the call has not ended, or the server sent no duration.
 */
export function formatCallDuration(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null
  const seconds = Math.round(ms / 1000)
  if (seconds < 1) return '不到 1 秒'
  if (seconds < 60) return `约 ${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 ? `约 ${minutes} 分 ${seconds % 60} 秒` : `约 ${minutes} 分`
  return `约 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}
