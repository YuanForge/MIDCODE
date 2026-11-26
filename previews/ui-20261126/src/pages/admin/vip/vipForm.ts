import type { AdminVIPGroup } from '@/lib/api/admin'

const CREDITS_PER_CNY = 1_000_000

export type VipForm = {
  id?: number
  code: string
  name: string
  recharge_threshold_cny: string
  discount_percent: string
  sort_order: string
  description: string
  is_active: boolean
}

export const emptyForm: VipForm = {
  code: '',
  name: '',
  recharge_threshold_cny: '',
  discount_percent: '100',
  sort_order: '0',
  description: '',
  is_active: true,
}

export function cny(value?: number) {
  return `¥${((value ?? 0) / CREDITS_PER_CNY).toFixed(2)}`
}

/** The discount in percent, whether the server sent it as a percentage or as basis points. */
export function discountOf(group: AdminVIPGroup) {
  return group.discount_percent ?? (group.discount_bps ?? 10000) / 100
}

export function formFromGroup(group?: AdminVIPGroup): VipForm {
  if (!group) return emptyForm
  return {
    id: group.id,
    code: group.code ?? '',
    name: group.name ?? '',
    recharge_threshold_cny: String((group.recharge_threshold ?? 0) / CREDITS_PER_CNY),
    discount_percent: String(discountOf(group)),
    sort_order: String(group.sort_order ?? 0),
    description: group.description ?? '',
    is_active: group.is_active ?? true,
  }
}

export function payloadFromForm(form: VipForm): Partial<AdminVIPGroup> {
  const threshold = Number(form.recharge_threshold_cny || '0')
  const discountPercent = Number(form.discount_percent || '100')
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    recharge_threshold: Math.round((Number.isFinite(threshold) ? threshold : 0) * CREDITS_PER_CNY),
    discount_bps: Math.round((Number.isFinite(discountPercent) ? discountPercent : 100) * 100),
    sort_order: Number.parseInt(form.sort_order || '0', 10) || 0,
    description: form.description.trim(),
    is_active: form.is_active,
  }
}
