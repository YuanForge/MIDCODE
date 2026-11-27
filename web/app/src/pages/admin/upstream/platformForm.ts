import type { AdminUpstreamPlatform } from '@/lib/api/admin'

export type PlatformForm = {
  name: string
  platform_type: string
  base_url: string
  api_key: string
  system_token: string
  upstream_user_id: string
  balance_alert_threshold: string
  note: string
  is_active: boolean
}

export const defaultForm: PlatformForm = {
  name: 'zzshu',
  platform_type: 'newapi',
  base_url: 'https://us.zzshu.cc',
  api_key: '',
  system_token: '',
  upstream_user_id: '',
  balance_alert_threshold: '',
  note: '',
  is_active: true,
}

/** The server only reports whether a secret is set, so editing starts with the secrets empty; leaving them empty keeps the stored value. */
export function formFromPlatform(p: AdminUpstreamPlatform): PlatformForm {
  return {
    name: p.name ?? '',
    platform_type: p.platform_type ?? 'openai',
    base_url: p.base_url ?? '',
    api_key: '',
    system_token: '',
    upstream_user_id: p.upstream_user_id ?? '',
    balance_alert_threshold: p.balance_alert_threshold && p.balance_alert_threshold > 0 ? String(p.balance_alert_threshold) : '',
    note: p.note ?? '',
    is_active: p.is_active ?? true,
  }
}

export function buildPlatformPayload(form: PlatformForm) {
  const threshold = Number.parseFloat(form.balance_alert_threshold)
  return {
    name: form.name.trim(),
    platform_type: form.platform_type,
    base_url: form.base_url.trim(),
    upstream_user_id: form.upstream_user_id.trim(),
    balance_alert_threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 0,
    note: form.note.trim(),
    is_active: form.is_active,
    ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
    ...(form.system_token.trim() ? { system_token: form.system_token.trim() } : {}),
  }
}

export function formatBalance(p: AdminUpstreamPlatform) {
  const currency = p.balance_currency || 'CNY'
  if (p.balance_synced_at && p.balance_amount != null) {
    if (currency === 'CNY') return `¥${p.balance_amount.toFixed(4)}`
    return `${currency} ${p.balance_amount.toFixed(4)}`
  }
  if (p.balance != null && p.balance > 0) return `¥${(p.balance / 1_000_000).toFixed(4)}`
  return '-'
}

export function platformLabel(type?: string) {
  if (type === 'newapi') return 'New API'
  if (type === 'sub2api') return 'Sub2API'
  return 'OpenAI'
}

export function supportsBalance(type?: string) {
  return type === 'newapi' || type === 'sub2api'
}

export function formatAlertThreshold(p: AdminUpstreamPlatform) {
  const threshold = p.balance_alert_threshold ?? 0
  if (!supportsBalance(p.platform_type) || threshold <= 0) return '关闭'
  const currency = p.balance_currency || 'CNY'
  return `${currency} <= ${threshold.toFixed(4)}`
}
