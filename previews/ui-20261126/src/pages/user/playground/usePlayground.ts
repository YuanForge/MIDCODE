import { useEffect, useRef, useState } from 'react'

import { buildUserInvokeHeaders, canInvokeWithSelectedKey } from '@/lib/api/request-auth'
import { channelModel, imageProtocol } from '@/lib/playground-images'
import {
  userApi,
  type ApiKeyRecord,
  type ChatConversation,
  type ConversationMessage,
  type UserChannel,
} from '@/lib/api/user'
import { DEFAULT_PARAMS, type ChatParams, type Message } from '@/pages/user/playground/types'

/** Everything the text playground needs: key and model choice, the transcript, streaming, and saved conversations. */
export function usePlayground() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [channels, setChannels] = useState<UserChannel[]>([])
  const [selectedKeyId, setSelectedKeyId] = useState<number | undefined>()
  const [selectedChannelId, setSelectedChannelId] = useState<number | undefined>()
  const [error, setError] = useState('')
  const [params, setParams] = useState<ChatParams>(DEFAULT_PARAMS)
  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [currentConvId, setCurrentConvId] = useState<number | undefined>()
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  async function loadConversations() {
    try {
      const res = await userApi.listConversations()
      setConversations(res.items ?? [])
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [keysRes, channelsRes] = await Promise.all([userApi.listApiKeys(), userApi.listChannels()])
        const nextKeys = Array.isArray(keysRes) ? keysRes : (keysRes.api_keys ?? keysRes.keys ?? [])
        const allChannels = Array.isArray(channelsRes) ? channelsRes : (channelsRes.channels ?? [])
        const nextChannels = [
          ...new Map(
            allChannels
              .filter((item) => item.type === 'llm' && !imageProtocol(channelModel(item)))
              .map((item) => [channelModel(item), item]),
          ).values(),
        ]
        setApiKeys(nextKeys)
        setChannels(nextChannels)
        if (nextKeys.length > 0) setSelectedKeyId(nextKeys[0].id)
        if (nextChannels.length > 0) setSelectedChannelId(nextChannels[0].id)
      } catch {
        setError('读取 API 密钥或模型列表失败')
      }
    }

    void load()
    void loadConversations()
  }, [])

  function canInvoke() {
    return canInvokeWithSelectedKey(apiKeys, selectedKeyId)
  }

  function currentChannel() {
    return channels.find((item) => item.id === selectedChannelId) ?? channels[0]
  }

  async function saveCurrentConversation() {
    if (messages.length === 0) return true
    const title = messages.find((m) => m.role === 'user')?.content.slice(0, 40) ?? '对话'
    const model = currentChannel()?.routing_model || currentChannel()?.name || ''
    try {
      const saved = await userApi.saveConversation({
        id: currentConvId,
        title,
        model,
        messages: messages as ConversationMessage[],
      })
      setCurrentConvId(saved.id)
      await loadConversations()
      return true
    } catch {
      setError('保存对话失败，当前内容已保留，请稍后重试。')
      return false
    }
  }

  async function newConversation() {
    const saved = await saveCurrentConversation()
    if (!saved) return
    setMessages([])
    setCurrentConvId(undefined)
  }

  function openConversation(conv: ChatConversation) {
    setMessages(conv.messages as Message[])
    setCurrentConvId(conv.id)
    setStreamingText('')
    const channel = channels.find((item) => channelModel(item) === conv.model)
    if (channel) setSelectedChannelId(channel.id)
  }

  async function deleteConversation(id: number) {
    try {
      await userApi.deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (currentConvId === id) {
        setMessages([])
        setCurrentConvId(undefined)
      }
    } catch {
      /* ignore */
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || streaming) return
    const authHeaders = buildUserInvokeHeaders(apiKeys, selectedKeyId)
    if (!authHeaders) {
      setError('请选择可用的 API 密钥')
      return
    }
    if (!selectedChannelId && channels.length === 0) {
      setError('当前没有可用的文本模型渠道')
      return
    }

    const nextMessages: Message[] = [...messages, { role: 'user', content: inputText.trim() }]
    setError('')
    setMessages(nextMessages)
    setInputText('')
    setStreaming(true)
    setStreamingText('')
    const controller = new AbortController()
    abortRef.current = controller
    let accum = ''

    const body: Record<string, unknown> = {
      model: currentChannel()?.routing_model || currentChannel()?.name || 'gpt-3.5-turbo',
      messages: [
        ...(params.systemPrompt.trim() ? [{ role: 'system', content: params.systemPrompt.trim() }] : []),
        ...nextMessages,
      ],
      stream: true,
    }
    const parsedMaxTokens = Number(params.maxTokens)
    if (Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0) {
      body.max_tokens = parsedMaxTokens
    }
    if (params.useTemp) body.temperature = params.temperature
    if (params.useTopP) body.top_p = params.topP

    try {
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || `请求失败 (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''

      while (true) {
        const { value, done } = await reader.read()
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true })
        const lines = pending.split('\n')
        pending = done ? '' : (lines.pop() ?? '')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content || ''
            accum += delta
            setStreamingText(accum)
          } catch {
            // skip malformed chunks
          }
        }
        if (done) break
      }

      setMessages((current) => [...current, { role: 'assistant', content: accum }])
      setStreamingText('')
    } catch (caught) {
      if (controller.signal.aborted) {
        if (accum) setMessages((current) => [...current, { role: 'assistant', content: accum }])
        setStreamingText('')
        return
      }
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: `请求失败：${caught instanceof Error ? caught.message : '未知错误'}` },
      ])
      setError(caught instanceof Error ? caught.message : '请求失败')
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }

  return {
    apiKeys,
    channels,
    selectedKeyId,
    setSelectedKeyId,
    selectedChannelId,
    setSelectedChannelId,
    error,
    params,
    updateParams: (patch: Partial<ChatParams>) => setParams((current) => ({ ...current, ...patch })),
    inputText,
    setInputText,
    messages,
    streaming,
    streamingText,
    conversations: conversations.filter((conv) => !conv.messages?.some((m) => m.image_request || m.images?.length)),
    currentConvId,
    keyUsable: canInvoke(),
    sendMessage,
    stop: () => abortRef.current?.abort(),
    newConversation,
    openConversation,
    deleteConversation,
    loadConversations,
  }
}
