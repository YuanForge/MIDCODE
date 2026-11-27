import type { AdminModelProvider } from '@/lib/api/admin'

export type ProviderForm = {
  id?: number
  code: string
  name: string
  sort_order: string
}

export const emptyForm: ProviderForm = { code: '', name: '', sort_order: '0' }

/** A provider that groups or channels still point at cannot be deleted, and its code can no longer change. */
export function hasReferences(provider: AdminModelProvider) {
  return (provider.group_count ?? 0) > 0 || (provider.channel_count ?? 0) > 0
}

export function formFromProvider(provider?: AdminModelProvider): ProviderForm {
  if (!provider) return emptyForm
  return {
    id: provider.id,
    code: provider.code ?? '',
    name: provider.name ?? '',
    sort_order: String(provider.sort_order ?? 0),
  }
}

export type BuiltProvider = { payload: { code: string; name: string; sort_order: number } } | { error: string }

/** Validate the form and build the request body, so the dialog can show the message where the person is looking. */
export function buildProviderPayload(form: ProviderForm): BuiltProvider {
  const sortOrder = Number(form.sort_order)
  if (!form.code.trim() || !form.name.trim() || !Number.isInteger(sortOrder) || sortOrder < 0) {
    return { error: '请填写合法的企业编码、显示名称和非负整数排序。' }
  }
  return { payload: { code: form.code, name: form.name, sort_order: sortOrder } }
}
