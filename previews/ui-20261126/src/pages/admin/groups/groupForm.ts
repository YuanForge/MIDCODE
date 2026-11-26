import type { AdminChannel, AdminModelGroup } from '@/lib/api/admin'

export type GroupForm = {
  id?: number
  code: string
  name: string
  model_provider_id: number
  description: string
  is_active: boolean
}

export const emptyForm: GroupForm = { code: '', name: '', model_provider_id: 0, description: '', is_active: true }

export type ModelOption = { model: string; channels: AdminChannel[] }

export function formFromGroup(group?: AdminModelGroup): GroupForm {
  if (!group) return emptyForm
  return {
    id: group.id,
    code: group.code ?? '',
    name: group.name ?? '',
    model_provider_id: group.model_provider_id ?? 0,
    description: group.description ?? '',
    is_active: group.is_active !== false,
  }
}

/** The public model a channel serves: its display name first, then the upstream model, then the channel name. */
export function channelModel(channel: AdminChannel) {
  return channel.display_name?.trim() || channel.model?.trim() || channel.name?.trim() || ''
}

export function channelOptionLabel(channel: AdminChannel, fallback: string) {
  return `#${channel.id} · ${channel.name ?? channel.display_name ?? fallback}`
}
