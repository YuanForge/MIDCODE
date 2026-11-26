import { useState } from 'react'

import { useAsync } from '@/hooks/use-async'
import { userApi, type UserTask } from '@/lib/api/user'
import { useGenResources } from '@/pages/user/gen/useGenResources'
import { useGenTask } from '@/pages/user/gen/useGenTask'
import { interpretVideoTask, pickVideoUrl, splitLines, type VideoGenerateResponse } from '@/pages/user/video/videoModel'

export type VideoFormValues = {
  prompt: string
  size: string
  aspectRatio: string
  duration: string
  referenceImages: string
  referenceVideos: string
}

const INITIAL: VideoFormValues = {
  prompt: '',
  size: '720p',
  aspectRatio: '16:9',
  duration: '5',
  referenceImages: '',
  referenceVideos: '',
}

/** Everything the video page needs: the key and model, the form, the submit request, the task, and finished history. */
export function useVideoGen() {
  const resources = useGenResources('video', '读取视频渠道或 API 密钥失败')
  const [form, setForm] = useState<VideoFormValues>(INITIAL)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const history = useAsync(async () => {
    const res = await userApi.listTasks({ type: 'video', status: 'done', size: 20 })
    return (Array.isArray(res) ? res : res.tasks ?? res.items ?? []) as UserTask[]
  }, [] as UserTask[])

  const task = useGenTask<string>({
    headers: resources.headers,
    interpret: interpretVideoTask,
    onFinished: history.reload,
  })

  async function generate() {
    if (!form.prompt.trim()) return
    const { headers, channel, channels } = resources
    if (!headers) {
      setError('请选择可用的 API 密钥')
      return
    }
    if (channels.length === 0) {
      setError('当前没有可用的视频模型渠道')
      return
    }

    setSubmitting(true)
    setError('')
    task.reset()
    try {
      const endpoint = channel?.id ? `/v1/video?channel_id=${channel.id}` : '/v1/video'
      const body: Record<string, unknown> = {
        model: channel?.routing_model || channel?.name,
        prompt: form.prompt,
        size: form.size,
        aspect_ratio: form.aspectRatio,
        duration: form.duration,
      }
      const images = splitLines(form.referenceImages)
      const videos = splitLines(form.referenceVideos)
      if (images.length > 0) body.refer_images = images
      if (videos.length > 0) body.refer_videos = videos

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error((await response.text()) || `请求失败 (${response.status})`)
      }
      const data = (await response.json()) as VideoGenerateResponse
      const syncUrl = pickVideoUrl(data.url, data.result?.url, data.items, data.result?.items)
      if (syncUrl) {
        task.finish(syncUrl)
        history.reload()
        return
      }
      const id = String(data.task_id ?? '')
      if (!id) throw new Error('接口没有返回任务 ID，请稍后重试')
      task.start(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    ...resources,
    form,
    update: (patch: Partial<VideoFormValues>) => setForm((current) => ({ ...current, ...patch })),
    appendReferences: (field: 'referenceImages' | 'referenceVideos', urls: string[]) =>
      setForm((current) => ({ ...current, [field]: [...splitLines(current[field]), ...urls].join('\n') })),
    error: error || resources.loadError,
    setError,
    submitting,
    generate,
    task,
    history: history.data,
    reloadHistory: history.reload,
  }
}
