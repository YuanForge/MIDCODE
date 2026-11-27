import type { AdminVendor } from '@/lib/api/admin'

export function isActive(row: AdminVendor) {
  return row.is_active ?? row.enabled ?? true
}

function ratioOf(row: AdminVendor) {
  return row.commission_ratio ?? row.fee_ratio
}

/** Balances arrive in millionths of a yuan. */
export function formatBalance(row: AdminVendor) {
  return `¥${((row.balance ?? row.balance_credits ?? 0) / 1_000_000).toFixed(4)}`
}

export function formatRatio(row: AdminVendor) {
  const ratio = ratioOf(row)
  return ratio == null ? '—（全局）' : `${(ratio * 100).toFixed(2)}%`
}

/** The ratio as the person types it: a percentage, empty when the vendor follows the global default. */
export function ratioToPercentText(row: AdminVendor) {
  const ratio = ratioOf(row)
  return ratio == null ? '' : String(parseFloat((ratio * 100).toFixed(2)))
}

export function listName(row: AdminVendor) {
  return row.username ?? row.name ?? '-'
}

export function vendorLabel(row?: AdminVendor | null) {
  return row?.username ?? row?.email ?? '-'
}
