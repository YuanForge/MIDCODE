import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { ApiKeyRecord, UserChannel } from '@/lib/api/user'
import { userApi } from '@/lib/api/user'
import { buildUserInvokeHeaders } from '@/lib/api/request-auth'
import type { CreationMode } from './constants'
import { analyzeImages, optimizePrompt } from './llm'

/** LLM 提示词优化 / 图片解析。真实接口版本（接 /v1/chat/completions）。 */
export function useCreationLlm({
  apiKeys,
  selectedKeyId,
  llmChannels,
}: {
  apiKeys: ApiKeyRecord[]
  selectedKeyId?: number
  llmChannels: UserChannel[]
}) {
  const [selectedLlmId, setSelectedLlmId] = useState<number | undefined>()
  const [optimizing, setOptimizing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const effectiveLlmId = selectedLlmId ?? llmChannels[0]?.id
  const llm = llmChannels.find((c) => c.id === effectiveLlmId) ?? llmChannels[0]

  const ensure = useCallback(() => {
    const authHeaders = buildUserInvokeHeaders(apiKeys, selectedKeyId)
    if (!authHeaders) {
      toast.error('请先选择可用的 API 密钥')
      return null
    }
    if (!llm) {
      toast.error('没有可用的 LLM 渠道')
      return null
    }
    return { authHeaders, model: llm.routing_model || llm.name || '', channelId: llm.id }
  }, [apiKeys, selectedKeyId, llm])

  const optimize = useCallback(
    async (mode: CreationMode, prompt: string): Promise<string | null> => {
      if (!prompt.trim()) {
        toast.error('请先填写提示词')
        return null
      }
      const ctx = ensure()
      if (!ctx) return null
      setOptimizing(true)
      try {
        const result = await optimizePrompt({ mode, prompt, model: ctx.model, authHeaders: ctx.authHeaders, channelId: ctx.channelId })
        toast.success('提示词已优化')
        return result
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '优化失败')
        return null
      } finally {
        setOptimizing(false)
      }
    },
    [ensure]
  )

  const analyzeImageFile = useCallback(
    async (mode: CreationMode, file: File): Promise<string | null> => {
      const ctx = ensure()
      if (!ctx) return null
      setAnalyzing(true)
      try {
        const { url } = await userApi.uploadImage(file, 'reference')
        if (!url) throw new Error('图片上传失败')
        const result = await analyzeImages({ mode, images: [url], model: ctx.model, authHeaders: ctx.authHeaders, channelId: ctx.channelId })
        toast.success('图片解析完成')
        return result
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '图片解析失败')
        return null
      } finally {
        setAnalyzing(false)
      }
    },
    [ensure]
  )

  return {
    selectedLlmId: effectiveLlmId,
    setSelectedLlmId,
    optimizing,
    analyzing,
    optimize,
    analyzeImageFile,
  }
}
