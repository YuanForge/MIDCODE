import type { AdminChannel } from '@/lib/api/admin'
import { buildAdvancedBillingConfigText } from '@/pages/admin/channels/billingConfig'
import { emptyForm, type ChannelForm } from '@/pages/admin/channels/channelForm'
import { getConfigBool, getConfigString, getNum, getTierNum, parseAmount, prettyJson, type Config } from '@/pages/admin/channels/config'

/** The markup is not stored. It is read back from how the selling price compares with the cost, and falls back to 1.2. */
function inferMarkup(cfg: Config) {
  const pairs: Array<[string, string]> = [
    ['input_price_per_1m_tokens', 'input_cost_per_1m_tokens'],
    ['base_price', 'base_cost'],
    ['price_per_second', 'cost_per_second'],
  ]
  for (const [priceKey, costKey] of pairs) {
    const price = parseAmount(cfg[priceKey])
    const cost = parseAmount(cfg[costKey])
    if (price && cost && cost > 0) return String(Math.round((price / cost) * 100) / 100)
  }
  return '1.2'
}

/** A form to edit a channel, or to copy it. A copy has no id, a ' - 副本' name and auto-sync off. */
export function buildFormFromChannel(row: AdminChannel, isCopy = false): ChannelForm {
  const cfg: Config = row.billing_config ?? {}

  return {
    ...emptyForm,
    id: isCopy ? undefined : row.id,
    name: isCopy ? `${row.name ?? ''} - 副本` : row.name ?? '',
    model: row.model ?? row.routing_model ?? '',
    model_provider_id: row.model_provider_id ?? 0,
    type: row.type ?? 'llm',
    protocol: row.protocol ?? 'openai',
    base_url: row.base_url ?? '',
    method: row.method ?? 'POST',
    query_url: row.query_url ?? '',
    query_method: row.query_method ?? 'GET',
    timeout_ms: String(row.timeout_ms ?? 60000),
    query_timeout_ms: String(row.query_timeout_ms ?? 30000),
    billing_type: row.billing_type === 'custom' ? 'token' : row.billing_type ?? 'token',
    headers_text: prettyJson(row.headers),
    billing_config_text: buildAdvancedBillingConfigText(cfg),
    upstream_platform_id: getConfigString(cfg, 'upstream_platform_id'),
    upstream_model: getConfigString(cfg, 'upstream_model') || row.model || row.routing_model || '',
    upstream_group: getConfigString(cfg, 'upstream_group'),
    upstream_cost_auto_sync: isCopy ? false : getConfigBool(cfg, 'upstream_cost_auto_sync'),
    billing_markup: inferMarkup(cfg),
    billing_fast_ratio: getConfigString(cfg, 'fast_ratio'),
    billing_input_price: getNum(cfg, 'input_price_per_1m_tokens'),
    billing_output_price: getNum(cfg, 'output_price_per_1m_tokens'),
    billing_input_cost: getNum(cfg, 'input_cost_per_1m_tokens'),
    billing_output_cost: getNum(cfg, 'output_cost_per_1m_tokens'),
    billing_cache_create_price: getNum(cfg, 'cache_creation_price_per_1m_tokens'),
    billing_cache_create_cost: getNum(cfg, 'cache_creation_cost_per_1m_tokens'),
    billing_cache_read_price: getNum(cfg, 'cache_read_price_per_1m_tokens'),
    billing_cache_read_cost: getNum(cfg, 'cache_read_cost_per_1m_tokens'),
    billing_input_from_response: Boolean(cfg.input_from_response),
    billing_base_price: getNum(cfg, 'base_price'),
    billing_base_cost: getNum(cfg, 'base_cost'),
    billing_size_price_1k: getTierNum(cfg, 'size_prices', '1k'),
    billing_size_price_2k: getTierNum(cfg, 'size_prices', '2k'),
    billing_size_price_3k: getTierNum(cfg, 'size_prices', '3k'),
    billing_size_price_4k: getTierNum(cfg, 'size_prices', '4k'),
    billing_size_cost_1k: getTierNum(cfg, 'size_costs', '1k'),
    billing_size_cost_2k: getTierNum(cfg, 'size_costs', '2k'),
    billing_size_cost_3k: getTierNum(cfg, 'size_costs', '3k'),
    billing_size_cost_4k: getTierNum(cfg, 'size_costs', '4k'),
    billing_default_size_price: getNum(cfg, 'default_size_price'),
    billing_default_size_cost: getNum(cfg, 'default_size_cost'),
    billing_price_per_second: getNum(cfg, 'price_per_second'),
    billing_cost_per_second: getNum(cfg, 'cost_per_second'),
    billing_price_per_call: getNum(cfg, 'price_per_call'),
    billing_cost_per_call: getNum(cfg, 'cost_per_call'),
    billing_script: row.billing_script ?? '',
    request_script: row.request_script ?? '',
    response_script: row.response_script ?? '',
    query_script: row.query_script ?? '',
    error_script: row.error_script ?? '',
    key_pool_id: row.key_pool_id ? String(row.key_pool_id) : '',
    auth_type: row.auth_type ?? 'bearer',
    auth_param_name: row.auth_param_name ?? '',
    auth_region: row.auth_region ?? '',
    auth_service: row.auth_service ?? '',
    passthrough_headers: row.passthrough_headers ?? false,
    passthrough_body: row.passthrough_body ?? false,
    weight: String(row.weight ?? 1),
    priority: String(row.priority ?? 0),
    icon_url: row.icon_url ?? '',
    description: row.description ?? '',
    display_name: row.display_name ?? '',
    groups: row.groups ?? [],
    is_active: row.is_active ?? true,
  }
}
