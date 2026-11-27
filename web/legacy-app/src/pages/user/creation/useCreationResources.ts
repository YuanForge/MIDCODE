import { useEffect, useMemo, useState } from 'react'

import { userApi, type ApiKeyRecord, type UserChannel } from '@/lib/api/user'
import { canInvokeWithSelectedKey } from '@/lib/api/request-auth'
import { MODES, type CreationMode } from './constants'

/**
 * 统一加载 API 密钥与全部渠道（一次性），按当前模式在内存中过滤渠道。
 * 切换模式时不重新请求，只重新过滤 + 重置选中渠道。
 */
export function useCreationResources(mode: CreationMode) {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [allChannels, setAllChannels] = useState<UserChannel[]>([])
  const [selectedKeyId, setSelectedKeyId] = useState<number | undefined>()
  const [selectedChannelId, setSelectedChannelId] = useState<number | undefined>()
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [keysRes, channelsRes] = await Promise.all([
          userApi.listApiKeys(),
          userApi.listChannels(),
        ])
        if (cancelled) return
        const nextKeys = Array.isArray(keysRes) ? keysRes : keysRes.api_keys ?? keysRes.keys ?? []
        const nextChannels = Array.isArray(channelsRes) ? channelsRes : channelsRes.channels ?? []
        setApiKeys(nextKeys)
        setAllChannels(nextChannels)
        if (nextKeys.length > 0) setSelectedKeyId(nextKeys[0].id)
      } catch {
        if (!cancelled) setLoadError('读取渠道或 API 密钥失败')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const modeMeta = useMemo(() => MODES.find((m) => m.key === mode) ?? MODES[0], [mode])

  const channels = useMemo(
    () => allChannels.filter((c) => modeMeta.channelMatch(c)),
    [allChannels, modeMeta]
  )

  const llmChannels = useMemo(
    () => allChannels.filter((c) => c.type === 'llm'),
    [allChannels]
  )

  // 模式切换或渠道列表变化时，确保选中项落在当前模式可用范围内
  useEffect(() => {
    if (channels.length === 0) {
      setSelectedChannelId(undefined)
      return
    }
    setSelectedChannelId((prev) =>
      prev && channels.some((c) => c.id === prev) ? prev : channels[0].id
    )
  }, [channels])

  const currentChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? channels[0],
    [channels, selectedChannelId]
  )

  const canInvoke = canInvokeWithSelectedKey(apiKeys, selectedKeyId)

  return {
    apiKeys,
    channels,
    llmChannels,
    selectedKeyId,
    setSelectedKeyId,
    selectedChannelId,
    setSelectedChannelId,
    currentChannel,
    canInvoke,
    loadError,
  }
}
