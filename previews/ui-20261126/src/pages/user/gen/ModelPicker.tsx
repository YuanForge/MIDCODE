import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import type { ApiKeyRecord, UserChannel } from '@/lib/api/user'

/** The key and the model a request is made with, stacked for the narrow form column. */
export function ModelPicker({
  idPrefix,
  apiKeys,
  channels,
  keyId,
  channelId,
  onKey,
  onChannel,
  emptyText,
}: {
  idPrefix: string
  apiKeys: ApiKeyRecord[]
  channels: UserChannel[]
  keyId: number | undefined
  channelId: number | undefined
  onKey: (id: number) => void
  onChannel: (id: number) => void
  emptyText: string
}) {
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor={`${idPrefix}-key`}>API 密钥</Label>
        <NativeSelect id={`${idPrefix}-key`} value={keyId ?? ''} onChange={(event) => onKey(Number(event.target.value))}>
          {apiKeys.map((key) => (
            <option key={key.id} value={key.id}>
              {key.name || key.masked_key || key.key}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor={`${idPrefix}-model`}>模型</Label>
        <NativeSelect
          id={`${idPrefix}-model`}
          value={channelId ?? ''}
          onChange={(event) => onChannel(Number(event.target.value))}
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </NativeSelect>
        {channels.length === 0 ? <p className='text-xs text-muted-foreground'>{emptyText}</p> : null}
      </div>
    </div>
  )
}
