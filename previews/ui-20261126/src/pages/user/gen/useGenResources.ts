import { useMemo, useState } from 'react'

import { useAsync } from '@/hooks/use-async'
import { buildUserInvokeHeaders, canInvokeWithSelectedKey } from '@/lib/api/request-auth'
import { userApi, type ApiKeyRecord, type UserChannel } from '@/lib/api/user'

/**
 * API keys plus the channels of one kind (video, music). The first key and the first channel are the
 * defaults and are derived while rendering, so no effect has to copy loaded data into state.
 */
export function useGenResources(type: string, failureText: string) {
  const { data, error } = useAsync(
    async () => {
      const [keysRes, channelsRes] = await Promise.all([userApi.listApiKeys(), userApi.listChannels()])
      const apiKeys = (Array.isArray(keysRes) ? keysRes : keysRes.api_keys ?? keysRes.keys ?? []) as ApiKeyRecord[]
      const all = Array.isArray(channelsRes) ? channelsRes : channelsRes.channels ?? []
      return { apiKeys, channels: all.filter((item) => item.type === type) as UserChannel[] }
    },
    { apiKeys: [] as ApiKeyRecord[], channels: [] as UserChannel[] },
  )
  const [pickedKey, setKeyId] = useState<number | undefined>()
  const [pickedChannel, setChannelId] = useState<number | undefined>()
  const keyId = pickedKey ?? data.apiKeys[0]?.id
  const channel = data.channels.find((item) => item.id === pickedChannel) ?? data.channels[0]
  const headers = useMemo(() => buildUserInvokeHeaders(data.apiKeys, keyId), [data.apiKeys, keyId])

  return {
    apiKeys: data.apiKeys,
    channels: data.channels,
    channel,
    keyId,
    setKeyId,
    channelId: channel?.id,
    setChannelId,
    headers,
    keyUsable: canInvokeWithSelectedKey(data.apiKeys, keyId),
    loadError: error ? failureText : '',
  }
}
