const SCALE = 1_000_000n

// Parse the decimal text before converting to Number; avoid floating-point rounding.
export function pointsToCredits(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim())
  if (!match) throw new Error('请输入大于 0 的积分，最多保留 6 位小数')
  const credits = BigInt(match[1]) * SCALE + BigInt((match[2] ?? '').padEnd(6, '0'))
  if (credits <= 0n) throw new Error('积分必须大于 0')
  if (credits > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('积分数超出允许范围')
  return Number(credits)
}

export function formatPoints(credits: number): string {
  return (credits / Number(SCALE)).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

export function pointsPreview(value: string): string {
  try { return formatPoints(pointsToCredits(value)) } catch { return '' }
}

export function deductionPayload(userID: string, amount: string, reason: string) {
  const id = Number(userID.trim())
  if (!/^\d+$/.test(userID.trim()) || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error('请输入有效的正整数用户 ID')
  }
  if ([...reason.trim()].length < 10) throw new Error('扣除原因至少 10 个字符')
  return { user_id: id, type: 'adjust', credits: -pointsToCredits(amount), reason: reason.trim() }
}
