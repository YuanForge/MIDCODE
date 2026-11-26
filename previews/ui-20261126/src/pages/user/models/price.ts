// Prices arrive from the backend as display text. These helpers only tidy that text for a card.
// They never recompute a price.

/** "¥14.0000" reads as "¥14.00". Up to two trailing zeros of the four decimals are dropped, never a significant digit. */
export function tidyPrice(text: string) {
  return text.replace(/¥\s*(\d[\d,]*\.\d{2})(\d{2})(?!\d)/g, (_match, head: string, tail: string) => `¥${head}${tail.replace(/0+$/, '')}`)
}

export type TokenPrice = { input: string; output: string }

/**
 * The usual token price line, "¥X / 1M 输入 + ¥Y / 1M 输出", split into its two figures so cards can be compared
 * figure by figure. Any other wording returns null and is shown as written.
 */
export function parseTokenPrice(line: string): TokenPrice | null {
  const match = /^¥\s*([\d.,]+)\s*\/\s*1M\s*输入\s*\+\s*¥\s*([\d.,]+)\s*\/\s*1M\s*输出$/.exec(line.trim())
  return match ? { input: `¥${match[1]}`, output: `¥${match[2]}` } : null
}
