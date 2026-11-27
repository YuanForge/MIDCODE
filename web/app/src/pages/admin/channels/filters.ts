export const CHANNEL_PAGE_SIZE = 20

export type ChannelFilterState = {
  q: string
  name: string
  display_name: string
  model_provider: string
  price_min: string
  price_max: string
  price_order: string
}

export const emptyChannelFilters: ChannelFilterState = {
  q: '',
  name: '',
  display_name: '',
  model_provider: '',
  price_min: '',
  price_max: '',
  price_order: '',
}

/** Only filters that were filled in go into the request. A price order becomes a sort pair. */
export function buildChannelParams(filters: ChannelFilterState) {
  const params: Record<string, string> = {}
  const { price_order: order, ...rest } = filters
  for (const [key, value] of Object.entries(rest)) {
    const trimmed = value.trim()
    if (trimmed) params[key] = trimmed
  }
  if (order) {
    params.sort_by = 'price'
    params.sort_order = order
  }
  return params
}
