import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { userApi, type UserTask } from '@/lib/api/user'
import { HISTORY_PAGE_SIZE, type CreationMode } from './constants'

export function useCreationHistory(mode: CreationMode) {
  const [tasks, setTasks] = useState<UserTask[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await userApi.listTasks({ type: mode, status: 'done', size: HISTORY_PAGE_SIZE })
      const list = Array.isArray(res) ? res : res.tasks ?? res.items ?? []
      setTasks(list)
    } catch {
      // 历史加载失败不阻断主流程
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { void load() }, [load])

  const clear = useCallback(async () => {
    try {
      await userApi.clearTaskHistory(mode)
      setTasks([])
      toast.success('已清空历史记录')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清空历史失败')
    }
  }, [mode])

  return { tasks, loading, load, clear }
}
