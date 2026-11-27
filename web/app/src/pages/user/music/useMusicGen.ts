import { useState } from 'react'

import { useAsync } from '@/hooks/use-async'
import { userApi, type UserTask } from '@/lib/api/user'
import { useGenResources } from '@/pages/user/gen/useGenResources'
import { useGenTask } from '@/pages/user/gen/useGenTask'
import { interpretMusicTask, type MusicItem, type MusicMode, type MusicResponse } from '@/pages/user/music/musicModel'

export type MusicFormValues = {
  mode: MusicMode
  description: string
  lyrics: string
  tags: string
  title: string
  instrumental: boolean
}

const INITIAL: MusicFormValues = {
  mode: '10',
  description: '',
  lyrics: '',
  tags: '',
  title: '',
  instrumental: false,
}

/** Everything the music page needs: the key and model, the form, the submit request, the task, and finished history. */
export function useMusicGen() {
  const resources = useGenResources('music', '读取音乐渠道或 API 密钥失败')
  const [form, setForm] = useState<MusicFormValues>(INITIAL)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const history = useAsync(async () => {
    const res = await userApi.listTasks({ type: 'music', status: 'done', size: 20 })
    return (Array.isArray(res) ? res : res.tasks ?? res.items ?? []) as UserTask[]
  }, [] as UserTask[])

  const task = useGenTask<MusicItem[]>({
    headers: resources.headers,
    interpret: interpretMusicTask,
    onFinished: history.reload,
  })

  async function generate() {
    const { headers, channel, channels } = resources
    if (!headers) {
      setError('请选择可用的 API 密钥')
      return
    }
    if (channels.length === 0) {
      setError('当前没有可用的音乐模型渠道')
      return
    }
    if (form.mode === '10' && !form.description.trim()) {
      setError('请输入灵感描述')
      return
    }

    setError('')
    task.reset()
    setSubmitting(true)

    const body: Record<string, unknown> = {
      model: channel?.routing_model || channel?.name,
      input_type: form.mode,
      make_instrumental: form.instrumental,
    }
    if (form.mode === '10') {
      body.gpt_description_prompt = form.description
    } else {
      body.prompt = form.lyrics
      body.tags = form.tags
      body.title = form.title
    }

    try {
      const endpoint = channel?.id ? `/v1/music?channel_id=${channel.id}` : '/v1/music'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as MusicResponse
      if (data.task_id) {
        task.start(String(data.task_id))
      } else if (Array.isArray(data.items)) {
        task.finish(data.items)
        history.reload()
      } else {
        task.fail(data.msg || `生成失败 (HTTP ${response.status})`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    ...resources,
    form,
    update: (patch: Partial<MusicFormValues>) => setForm((current) => ({ ...current, ...patch })),
    error: error || resources.loadError,
    submitting,
    generate,
    task,
    history: history.data,
    reloadHistory: history.reload,
  }
}
