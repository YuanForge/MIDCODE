import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import type { ApiKeyRecord, UserChannel } from '@/lib/api/user'

/** The two choices every request needs, kept above the transcript so they are never scrolled away on a phone. */
export function ModelBar({
  apiKeys,
  channels,
  keyId,
  channelId,
  onKey,
  onChannel,
}: {
  apiKeys: ApiKeyRecord[]
  channels: UserChannel[]
  keyId: number | undefined
  channelId: number | undefined
  onKey: (id: number) => void
  onChannel: (id: number) => void
}) {
  return (
    <div className='glass grid gap-4 p-4 sm:grid-cols-2'>
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='playground-key'>API 密钥</Label>
        <NativeSelect id='playground-key' value={keyId ?? ''} onChange={(event) => onKey(Number(event.target.value))}>
          {apiKeys.map((key) => (
            <option key={key.id} value={key.id}>
              {key.name || key.masked_key || key.key}
            </option>
          ))}
        </NativeSelect>
        <p className='text-xs text-muted-foreground'>已登录用户可直接使用已创建的密钥进行调用。</p>
      </div>
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='playground-model'>模型</Label>
        <NativeSelect
          id='playground-model'
          value={channelId ?? ''}
          onChange={(event) => onChannel(Number(event.target.value))}
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name} {channel.routing_model ? `· ${channel.routing_model}` : ''}
            </option>
          ))}
        </NativeSelect>
        {channels.length === 0 ? <p className='text-xs text-muted-foreground'>当前没有可用的文本模型渠道。</p> : null}
      </div>
    </div>
  )
}
