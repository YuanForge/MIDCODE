export type SettingsMap = Record<string, string>
export type SetSetting = (key: string, value: string) => void
export type PlanRow = { credits: number; bonus: number; amount: number; origin_amount: number; desc: string }
export type ProxyRule = { from: string; to: string }

/** What a field needs from the settings form: its id, its current text and how it changes. */
export type Bound = { id: string; value: string; onChange: (next: string) => void }

/** Ties a field to one key of the settings form. The fallback is shown when the key has never been saved. */
export function binder(form: SettingsMap, set: SetSetting) {
  return (name: string, fallback = ''): Bound => ({
    id: `setting-${name}`,
    value: form[name] ?? fallback,
    onChange: (next) => set(name, next),
  })
}

export const emptyPlan: PlanRow = { credits: 100, bonus: 0, amount: 10, origin_amount: 0, desc: '' }

export function totalPlanCredits(plan: PlanRow) {
  return Number(plan.credits || 0) + Number(plan.bonus || 0)
}

export function planDiscountLabel(plan: PlanRow) {
  const originAmount = Number(plan.origin_amount || 0)
  const amount = Number(plan.amount || 0)
  if (originAmount <= 0 || originAmount <= amount) return '—'
  return `${(((originAmount - amount) / originAmount) * 100).toFixed(1)}%`
}

/** A ratio stored as 0.05 is edited as 5 (percent). */
export function ratioToPercentText(raw?: string) {
  return String(parseFloat((parseFloat(raw || '0') * 100).toFixed(2)) || '')
}

export function percentTextToRatio(text: string) {
  return (parseFloat(text || '0') / 100).toFixed(4)
}

export function parsePlans(raw?: string): PlanRow[] {
  try {
    return JSON.parse(raw || '[]')
  } catch {
    return []
  }
}

/** Rules are stored as a list; an older single from/to pair is still read when the list is empty. */
export function parseProxyRules(settings: SettingsMap): ProxyRule[] {
  const legacy = settings.result_url_proxy_from ? [{ from: settings.result_url_proxy_from, to: settings.result_url_proxy_to ?? '' }] : []
  try {
    const parsed: ProxyRule[] = JSON.parse(settings.result_url_proxy_rules || '[]')
    return parsed.length > 0 ? parsed : legacy
  } catch {
    return legacy
  }
}

export type FormExtras = {
  allowCustom: boolean
  planRows: PlanRow[]
  rebatePercent: string
  vendorCommPercent: string
  proxyRules: ProxyRule[]
}

/** The settings as the server stores them: the form, plus the fields that are edited in a different shape. */
export function buildSettingsPayload(form: SettingsMap, extras: FormExtras): SettingsMap {
  const payload: SettingsMap = {
    ...form,
    recharge_allow_custom: extras.allowCustom ? 'true' : 'false',
    recharge_plans: JSON.stringify(extras.planRows),
    default_rebate_ratio: percentTextToRatio(extras.rebatePercent),
    default_vendor_commission: percentTextToRatio(extras.vendorCommPercent),
    result_url_proxy_rules: JSON.stringify(extras.proxyRules.filter((rule) => rule.from.trim() && rule.to.trim())),
  }
  // A derived address and the retired single proxy pair are never written back.
  delete payload.pay_apply_notify_url
  delete payload.result_url_proxy_from
  delete payload.result_url_proxy_to
  return payload
}
