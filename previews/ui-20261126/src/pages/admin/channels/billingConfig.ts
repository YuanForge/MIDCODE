import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import {
  fromCnyInput,
  parseJsonField,
  prettyJson,
  structuredBillingConfigKeys,
  upstreamMetaKeys,
  type Config,
} from '@/pages/admin/channels/config'

/** What the JSON box shows: the stored config minus the keys the form fields own. */
export function buildAdvancedBillingConfigText(cfg: Config) {
  const rest = Object.fromEntries(
    Object.entries(cfg).filter(([key]) => !structuredBillingConfigKeys.has(key) && !upstreamMetaKeys.has(key))
  )
  return prettyJson(rest)
}

function buildSizeMap(entries: Array<[string, string]>) {
  const mapped: Record<string, number> = {}
  for (const [key, value] of entries) {
    const parsed = fromCnyInput(value)
    if (parsed !== undefined) mapped[key] = parsed
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined
}

/** The billing config sent on save: the JSON box first, then the form fields on top. Selling prices are worked out as cost × markup. */
export function buildBillingConfig(form: ChannelForm): Config {
  const cfg = parseJsonField('高级计费配置', form.billing_config_text)

  for (const key of structuredBillingConfigKeys) {
    delete cfg[key]
  }

  const markup = parseFloat(form.billing_markup) || 1

  const setNumber = (key: string, value: string) => {
    const parsed = fromCnyInput(value)
    if (parsed !== undefined) cfg[key] = parsed
  }

  const setCostAndPrice = (costKey: string, priceKey: string, costValue: string) => {
    const cost = fromCnyInput(costValue)
    if (cost === undefined) return
    cfg[costKey] = cost
    cfg[priceKey] = Math.round(cost * markup)
  }

  switch (form.billing_type) {
    case 'token':
      setCostAndPrice('input_cost_per_1m_tokens', 'input_price_per_1m_tokens', form.billing_input_cost)
      setCostAndPrice('output_cost_per_1m_tokens', 'output_price_per_1m_tokens', form.billing_output_cost)
      setCostAndPrice('cache_creation_cost_per_1m_tokens', 'cache_creation_price_per_1m_tokens', form.billing_cache_create_cost)
      setCostAndPrice('cache_read_cost_per_1m_tokens', 'cache_read_price_per_1m_tokens', form.billing_cache_read_cost)
      if (form.billing_input_from_response) {
        cfg.input_from_response = true
      }
      if (form.billing_fast_ratio.trim()) {
        const fastRatio = Number(form.billing_fast_ratio)
        if (!Number.isFinite(fastRatio) || fastRatio <= 0 || fastRatio > 100) {
          throw new Error('Fast 倍率必须是大于 0 且不超过 100 的数字')
        }
        cfg.fast_ratio = fastRatio
      }
      break
    case 'image': {
      setCostAndPrice('base_cost', 'base_price', form.billing_base_cost)
      setCostAndPrice('default_size_cost', 'default_size_price', form.billing_default_size_cost)

      const sizeCosts = buildSizeMap([
        ['1k', form.billing_size_cost_1k],
        ['2k', form.billing_size_cost_2k],
        ['3k', form.billing_size_cost_3k],
        ['4k', form.billing_size_cost_4k],
      ])
      if (sizeCosts) {
        cfg.size_costs = sizeCosts
        const sizePrices: Record<string, number> = {}
        for (const [tier, cost] of Object.entries(sizeCosts)) {
          sizePrices[tier] = Math.round(cost * markup)
        }
        cfg.size_prices = sizePrices
      } else {
        const sizePrices = buildSizeMap([
          ['1k', form.billing_size_price_1k],
          ['2k', form.billing_size_price_2k],
          ['3k', form.billing_size_price_3k],
          ['4k', form.billing_size_price_4k],
        ])
        if (sizePrices) cfg.size_prices = sizePrices
        setNumber('base_price', form.billing_base_price)
        setNumber('default_size_price', form.billing_default_size_price)
      }
      break
    }
    case 'video':
    case 'audio':
      setCostAndPrice('cost_per_second', 'price_per_second', form.billing_cost_per_second)
      break
    case 'count':
      setCostAndPrice('cost_per_call', 'price_per_call', form.billing_cost_per_call)
      break
  }

  const upstreamPlatformID = Number(form.upstream_platform_id || '0')
  if (upstreamPlatformID > 0) {
    cfg.upstream_platform_id = upstreamPlatformID
    cfg.upstream_model = form.upstream_model.trim() || form.model.trim()
    cfg.price_markup = markup
    if (form.upstream_cost_auto_sync) {
      cfg.upstream_cost_auto_sync = true
    }
    if (form.upstream_group.trim()) {
      cfg.upstream_group = form.upstream_group.trim()
    }
  }

  return cfg
}
