export type Config = Record<string, unknown>

export const emptyJson = '{}'
export const sizeTierKeys = ['1k', '2k', '3k', '4k'] as const
export type SizeTier = (typeof sizeTierKeys)[number]

/** Prices and costs are stored as millionths of a yuan. */
export const creditsPrecision = 1_000_000

/** Keys the structured billing form owns. They are rebuilt from the form on save, so they stay out of the JSON box. */
export const structuredBillingConfigKeys = new Set([
  'input_price_per_1m_tokens',
  'output_price_per_1m_tokens',
  'input_cost_per_1m_tokens',
  'output_cost_per_1m_tokens',
  'cache_creation_price_per_1m_tokens',
  'cache_creation_cost_per_1m_tokens',
  'cache_read_price_per_1m_tokens',
  'cache_read_cost_per_1m_tokens',
  'fast_ratio',
  'input_from_response',
  'base_price',
  'base_cost',
  'size_prices',
  'size_costs',
  'default_size_price',
  'default_size_cost',
  'price_per_second',
  'cost_per_second',
  'price_per_call',
  'cost_per_call',
  'pricing_groups',
])

/** Keys written by the upstream cost binding. They are rebuilt from the form too. */
export const upstreamMetaKeys = new Set([
  'upstream_platform_id',
  'upstream_platform_name',
  'upstream_platform_type',
  'upstream_base_url',
  'upstream_model',
  'upstream_group',
  'price_markup',
  'upstream_cost_auto_sync',
])

export function prettyJson(value: unknown) {
  if (!value || (typeof value === 'object' && Object.keys(value as object).length === 0)) {
    return emptyJson
  }
  return JSON.stringify(value, null, 2)
}

/** A JSON object from a text box. Anything else, such as null or a list, is refused with the field's name. */
export function parseJsonField(label: string, value: string): Config {
  let parsed: unknown
  try {
    parsed = JSON.parse(value || emptyJson)
  } catch {
    throw new Error(`${label} 不是合法 JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 需要是 JSON 对象`)
  }
  return parsed as Config
}

export function parseAmount(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function formatCnyValue(value: number) {
  return value.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1')
}

/** A stored amount as the yuan text shown in an input. */
export function toCnyInput(value: unknown): string {
  const amount = parseAmount(value)
  return amount === undefined ? '' : formatCnyValue(amount / creditsPrecision)
}

export function formatCnyDisplay(value: unknown): string {
  const amount = parseAmount(value)
  return amount === undefined ? 'CNY 0' : `CNY ${formatCnyValue(amount / creditsPrecision)}`
}

/** Yuan text from an input as a stored amount. Empty or invalid text is undefined. */
export function fromCnyInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return Math.round(parsed * creditsPrecision)
}

export function getNum(cfg: Config, key: string): string {
  return toCnyInput(cfg[key])
}

export function getTierNum(cfg: Config, key: 'size_prices' | 'size_costs', tier: SizeTier): string {
  const raw = cfg[key]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  return toCnyInput((raw as Config)[tier])
}

export function getConfigString(cfg: Config, key: string): string {
  const value = cfg[key]
  return value === undefined || value === null ? '' : String(value)
}

export function getConfigBool(cfg: Config, key: string): boolean {
  const value = cfg[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
  if (typeof value === 'number') return value !== 0
  return false
}
