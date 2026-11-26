import type { UserStatsResponse } from '@/lib/api/user'

function dayKey(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Last 7 calendar days ending today. The backend only returns days that have transactions, so a missing day is a real zero. */
export function buildWeek(stats: UserStatsResponse) {
  const credits = new Map((stats.daily_credits ?? []).map((row) => [row.day ?? '', row.credits ?? 0]))
  const today = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const key = dayKey(date)
    return { key, isToday: index === 6, value: Math.max(0, credits.get(key) ?? 0) }
  })
}

/** Successful and failed requests over the days the backend reported. */
export function sumRequests(stats: UserStatsResponse) {
  return (stats.daily_requests ?? []).reduce<{ success: number; failed: number }>(
    (sum, row) => ({ success: sum.success + (row.success ?? 0), failed: sum.failed + (row.failed ?? 0) }),
    { success: 0, failed: 0 },
  )
}

/** How many days the balance lasts at the average daily spend of the last 7 days. Null when nothing was spent. */
export function runwayDays(balance: number, weekTotal: number) {
  const perDay = weekTotal / 7
  return perDay > 0 ? balance / perDay : null
}
