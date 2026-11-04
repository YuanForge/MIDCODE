export function formatCacheHitPercent(percent?: number | null): string {
  return typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? `${percent.toFixed(2)}%`
    : '—'
}

export function inputCacheHitPercent(nonCached: number, read: number, write: number): number | null {
  if (![nonCached, read, write].every(value => Number.isFinite(value) && value >= 0)) return null
  const total = nonCached + read + write
  return total > 0 && Number.isFinite(total) ? read / total * 100 : null
}
