/** Credits arrive as micro-credits; the console shows them as yuan with four decimals. */
export function fmtCredits(v: number | undefined) {
  if (v == null) return '--'
  return (v / 1_000_000).toFixed(4)
}

/** Profit stays in ink while it is zero or positive; only a loss is marked in the destructive colour. */
export function profitClass(v: number | undefined) {
  if (v == null) return ''
  return v >= 0 ? 'text-foreground' : 'text-destructive'
}
