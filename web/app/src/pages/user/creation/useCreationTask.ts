import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiKeyRecord } from '@/lib/api/user'
import { buildUserInvokeHeaders } from '@/lib/api/request-auth'
import { POLL_INTERVAL_MS } from './constants'
import type { CreationMode, GenerateResponse, TaskStatus } from './types'
import { collectImageSources, pickVideoUrl } from './media'

type Params = {
  apiKeys: ApiKeyRecord[]
  selectedKeyId?: number
  onDone?: () => void
}

type GenerateArgs = {
  mode: CreationMode
  endpoint: string
  body: Record<string, unknown>
  channelId?: number
}

/**
 * 负责提交生成请求 + 任务轮询。
 * 同步返回结果时直接展示；返回 task_id 时每 POLL_INTERVAL_MS 轮询一次 /v1/tasks/:id。
 */
export function useCreationTask({ apiKeys, selectedKeyId, onDone }: Params) {
  const [status, setStatus] = useState<TaskStatus>('idle')
  const [taskId, setTaskId] = useState('')
  const [taskError, setTaskError] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [running, setRunning] = useState(false)
  const modeRef = useRef<CreationMode>('image')

  const reset = useCallback(() => {
    setStatus('idle')
    setTaskId('')
    setTaskError('')
    setImages([])
    setVideoUrl('')
  }, [])

  const generate = useCallback(
    async ({ mode, endpoint, body, channelId }: GenerateArgs) => {
      const authHeaders = buildUserInvokeHeaders(apiKeys, selectedKeyId)
      if (!authHeaders) {
        setTaskError('请选择可用的 API 密钥')
        setStatus('failed')
        return
      }
      modeRef.current = mode
      setRunning(true)
      setImages([])
      setVideoUrl('')
      setTaskId('')
      setTaskError('')
      setStatus('polling')

      try {
        const url = channelId ? `${endpoint}?channel_id=${channelId}` : endpoint
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(body),
        })
        if (!response.ok) {
          throw new Error((await response.text()) || `请求失败 (${response.status})`)
        }
        const data = (await response.json()) as GenerateResponse

        if (mode === 'image') {
          const syncImages = collectImageSources(
            data.data, data.urls, data.url, data.items,
            data.result?.data, data.result?.urls, data.result?.url,
          )
          if (syncImages.length > 0) {
            setImages(syncImages)
            setStatus('done')
            setRunning(false)
            onDone?.()
            return
          }
        } else {
          const syncVideo = pickVideoUrl(data.url, data.items, data.result?.url, data.result?.items)
          if (syncVideo) {
            setVideoUrl(syncVideo)
            setStatus('done')
            setRunning(false)
            onDone?.()
            return
          }
        }

        if (data.task_id) {
          setTaskId(String(data.task_id))
          setStatus('polling')
        } else if (data.status === 'failed' || data.status === 3) {
          throw new Error(data.error_msg ?? data.msg ?? '生成失败')
        } else {
          throw new Error(data.msg ?? '未返回结果')
        }
      } catch (err) {
        setTaskError(err instanceof Error ? err.message : '生成失败')
        setStatus('failed')
        setRunning(false)
      }
    },
    [apiKeys, selectedKeyId, onDone]
  )

  // 轮询
  useEffect(() => {
    if (!taskId || status !== 'polling') return
    const authHeaders = buildUserInvokeHeaders(apiKeys, selectedKeyId)
    if (!authHeaders) return
    let cancelled = false

    const tick = async () => {
      try {
        const resp = await fetch(`/v1/tasks/${taskId}`, { headers: authHeaders })
        if (!resp.ok) return
        const data = (await resp.json()) as GenerateResponse
        if (cancelled) return
        const st = data.status
        if (st === 'done' || st === 2) {
          const result = data.result ?? {}
          if (modeRef.current === 'image') {
            setImages(collectImageSources(result.data, result.urls, result.url, data.urls, data.url, data.items))
          } else {
            setVideoUrl(pickVideoUrl(result.url, data.url, result.items, data.items))
          }
          setStatus('done')
          setRunning(false)
          onDone?.()
        } else if (st === 'failed' || st === 3) {
          setTaskError(data.error_msg ?? data.msg ?? '生成失败')
          setStatus('failed')
          setRunning(false)
        }
      } catch {
        // 忽略单次轮询失败
      }
    }

    const timer = setInterval(() => { void tick() }, POLL_INTERVAL_MS)
    void tick()
    return () => { cancelled = true; clearInterval(timer) }
  }, [taskId, status, apiKeys, selectedKeyId, onDone])

  return { status, taskId, taskError, images, videoUrl, running, generate, reset }
}
