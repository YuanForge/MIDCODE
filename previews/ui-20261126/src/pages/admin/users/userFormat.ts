import type { AdminUser, AdminVIPGroup } from '@/lib/api/admin'

export const PAGE_SIZE = 20

export type UserFilterState = {
  email: string
  uid: string
  status: string
  group: string
  balance_min: string
  balance_max: string
}

export const emptyFilters: UserFilterState = { email: '', uid: '', status: '', group: '', balance_min: '', balance_max: '' }

export type VipChoice = AdminVIPGroup & { code: string }

/** Balances, spending and VIP baselines arrive in millionths of a yuan. */
export function yuan(raw: unknown, digits = 4) {
  if (raw === undefined || raw === null) return '-'
  return `¥${(Number(raw) / 1e6).toFixed(digits)}`
}

export function fmtBalance(user: AdminUser) {
  return yuan(user.balance)
}

export function fmtTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

export function isActive(user: AdminUser) {
  return user.is_active ?? true
}

export function fmtReferralName(user?: { id?: number; username?: string; email?: string } | null) {
  if (!user) return '无'
  const name = user.username || user.email || '未命名用户'
  return `#${user.id ?? '-'} ${name}`
}

/** Active tiers that have a code: the options of a VIP picker. */
export function activeVipChoices(groups: AdminVIPGroup[]): VipChoice[] {
  return groups.filter((group): group is VipChoice => group.is_active !== false && Boolean(group.code?.trim()))
}

export function vipLabel(group: AdminVIPGroup) {
  const percent = group.discount_percent ?? (group.discount_bps ?? 10000) / 100
  return `${group.name || group.code}（${percent}%）`
}

/** Only filters that were filled in go into the request. */
export function buildUserParams(filters: UserFilterState) {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value
  }
  return params
}

export const QUICK_AMOUNTS = [
  { value: '1000000', label: '¥1' },
  { value: '10000000', label: '¥10' },
  { value: '100000000', label: '¥100' },
]

export function creditsHint(value: string) {
  return `${Number(value).toLocaleString()} credits = ¥${(Number(value) / 1e6).toFixed(6)}`
}
