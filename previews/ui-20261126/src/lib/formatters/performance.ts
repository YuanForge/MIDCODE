/** Request-level measurements; missing historical data must not appear as zero. */
export function formatTTFT(milliseconds?: number | null): string {
  return typeof milliseconds === 'number' && Number.isFinite(milliseconds) && milliseconds >= 0
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : '—'
}

export function formatTPS(tokensPerSecond?: number | null): string {
  return typeof tokensPerSecond === 'number' && Number.isFinite(tokensPerSecond) && tokensPerSecond > 0
    ? `${tokensPerSecond.toFixed(1)} token/s`
    : '—'
}
