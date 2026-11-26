export function formatCredits(value: number | undefined | null) {
  if (value == null || value === 0) return '0.00'
  const credits = value / 1e6
  const abs = Math.abs(credits)
  if (abs >= 0.01) return credits.toFixed(2)
  if (abs >= 0.0001) return credits.toFixed(6)
  return credits.toFixed(8)
}

export function formatTokenPricePerMillion(value: number | undefined | null) {
  if (value == null) return '-'
  return `CNY ${formatCredits(value)} / 1M`
}

/** Micro-credits in one credit. The ledger stores whole micro-credits, and one credit is one yuan. */
export const MICRO_PER_CREDIT = 1_000_000

/**
 * Reads an amount a person typed, in credits, into the whole micro-credits the ledger stores. The digits are read
 * as written, not through a floating-point product, so the figure sent is exactly the figure typed.
 * Null when the text is not a plain non-negative decimal, has more than six decimal places (finer than the ledger
 * holds), or is too large to send exactly.
 */
export function parseCreditsInput(text: string): number | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text.trim())
  if (!match) return null
  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  if ((!whole && !fraction) || fraction.length > 6) return null
  const micro = Number(whole || '0') * MICRO_PER_CREDIT + Number(fraction.padEnd(6, '0'))
  return Number.isSafeInteger(micro) ? micro : null
}

/**
 * Micro-credits written out in full as credits: nothing rounded, and no trailing zeros beyond `minDecimals`.
 * 36426789 is "36.426789"; 100000000 is "100", or "100.00" when two decimals are asked for.
 */
export function exactCredits(micro: number, minDecimals = 0) {
  const abs = Math.abs(Math.trunc(micro))
  const whole = Math.floor(abs / MICRO_PER_CREDIT)
  const fraction = String(abs % MICRO_PER_CREDIT).padStart(6, '0').replace(/0+$/, '').padEnd(minDecimals, '0')
  return `${micro < 0 ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}
