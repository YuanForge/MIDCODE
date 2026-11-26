import type { AdminChannel } from '@/lib/api/admin'
import { formatCnyDisplay, getConfigBool, getConfigString, sizeTierKeys, type Config } from '@/pages/admin/channels/config'

/** One line of price or cost for a billing type. Which keys it reads depends on whether it is the selling price or the cost. */
export function formatBillingSummary(billingType: string | undefined, cfg: Config, mode: 'price' | 'cost' = 'price') {
  const sizeMapKey = mode === 'price' ? 'size_prices' : 'size_costs'
  const defaultSizeKey = mode === 'price' ? 'default_size_price' : 'default_size_cost'
  const baseKey = mode === 'price' ? 'base_price' : 'base_cost'
  const perSecondKey = mode === 'price' ? 'price_per_second' : 'cost_per_second'
  const perCallKey = mode === 'price' ? 'price_per_call' : 'cost_per_call'
  const inputKey = mode === 'price' ? 'input_price_per_1m_tokens' : 'input_cost_per_1m_tokens'
  const outputKey = mode === 'price' ? 'output_price_per_1m_tokens' : 'output_cost_per_1m_tokens'

  switch (billingType) {
    case 'token':
      return `输入 ${formatCnyDisplay(cfg[inputKey])} / 输出 ${formatCnyDisplay(cfg[outputKey])}`
    case 'image': {
      const sizes = cfg[sizeMapKey]
      if (sizes && typeof sizes === 'object' && !Array.isArray(sizes)) {
        const parts = sizeTierKeys
          .map((key) => {
            const value = (sizes as Config)[key]
            return value !== undefined && value !== null && value !== 0 ? `${key}:${formatCnyDisplay(value)}` : null
          })
          .filter(Boolean)
        if (parts.length > 0) return parts.join(' / ')
      }
      return `基础 ${formatCnyDisplay(cfg[defaultSizeKey] ?? cfg[baseKey] ?? 0)}`
    }
    case 'video':
    case 'audio':
      return `${formatCnyDisplay(cfg[perSecondKey] ?? 0)} /秒`
    case 'count':
      return `${formatCnyDisplay(cfg[perCallKey] ?? 0)} /次`
    default:
      return '—'
  }
}

export function priceSummary(channel: AdminChannel) {
  return formatBillingSummary(channel.billing_type, channel.billing_config ?? {}, 'price')
}

export function costSummary(channel: AdminChannel) {
  return formatBillingSummary(channel.billing_type, channel.billing_config ?? {}, 'cost')
}

export function isAutoSync(channel: AdminChannel) {
  return getConfigBool(channel.billing_config ?? {}, 'upstream_cost_auto_sync')
}

/** Which upstream a channel takes its cost from: platform, model and group, or that it has none. */
export function upstreamSummary(channel: AdminChannel) {
  const cfg = channel.billing_config ?? {}
  const platformName = getConfigString(cfg, 'upstream_platform_name')
  const platformID = getConfigString(cfg, 'upstream_platform_id')
  const upstreamModel = getConfigString(cfg, 'upstream_model')
  const upstreamGroup = getConfigString(cfg, 'upstream_group')

  if (!platformID && !platformName && !upstreamModel) return '未绑定上游'

  const parts = [platformName || (platformID ? `#${platformID}` : '上游')]
  if (upstreamModel) parts.push(upstreamModel)
  if (upstreamGroup) parts.push(upstreamGroup)
  return parts.join(' / ')
}
