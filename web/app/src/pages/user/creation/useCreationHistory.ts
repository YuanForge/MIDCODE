import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { userApi, type UserTask } from '@/lib/api/user'
import { HISTORY_PAGE_SIZE, type CreationMode } from './constants'

type LoadOptions = {
  reset?: boolean
}

type TaskListResponse = Awaited<ReturnType<typeof userApi.listTasks>>

function extractTasks(res: TaskListResponse) {
  return Array.isArray(res) ? res : res.tasks ?? res.items ?? []
}

function extractTotal(res: TaskListResponse, fallback: number) {
  return Array.isArray(res) ? fallback : res.total ?? fallback
}

function taskKey(task: UserTask) {
  return String(task.task_id ?? task.id ?? `${task.created_at ?? ''}-${task.url ?? ''}`)
}

function mergeTasks(current: UserTask[], incoming: UserTask[]) {
  const seen = new Set(current.map(taskKey))
  const merged = [...current]
  for (const task of incoming) {
    const key = taskKey(task)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(task)
    }
  }
  return merged
}

export function useCreationHistory(mode: CreationMode) {
  const [tasks, setTasks] = useState<UserTask[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const pageRef = useRef(0)
  const hasMoreRef = useRef(true)
  const loadingRef = useRef(false)
  const requestRef = useRef(0)
  const tasksLengthRef = useRef(0)

  const load = useCallback(async (options: LoadOptions = {}) => {
    const reset = options.reset ?? true
    if (!reset && (loadingRef.current || !hasMoreRef.current)) return

    const nextPage = reset ? 1 : pageRef.current + 1
    const requestId = ++requestRef.current
    loadingRef.current = true
    if (reset) setLoading(true)
    else setLoadingMore(true)

    try {
      const res = await userApi.listTasks({
        type: mode,
        status: 'done',
        page: nextPage,
        size: HISTORY_PAGE_SIZE,
      })
      if (requestId !== requestRef.current) return

      const list = extractTasks(res)
      const nextTotal = extractTotal(res, reset ? list.length : tasksLengthRef.current + list.length)
      const nextHasMore = nextTotal > 0 ? nextPage * HISTORY_PAGE_SIZE < nextTotal : list.length >= HISTORY_PAGE_SIZE

      pageRef.current = nextPage
      hasMoreRef.current = nextHasMore
      setTotal(nextTotal)
      setHasMore(nextHasMore)
      setTasks((current) => {
        const next = reset ? list : mergeTasks(current, list)
        tasksLengthRef.current = next.length
        return next
      })
    } catch {
      // 历史加载失败不阻断主流程。
    } finally {
      if (requestId === requestRef.current) {
        loadingRef.current = false
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [mode])

  useEffect(() => {
    pageRef.current = 0
    hasMoreRef.current = true
    tasksLengthRef.current = 0
    setTasks([])
    setTotal(0)
    setHasMore(true)
    void load()
  }, [load])

  const loadMore = useCallback(async () => {
    await load({ reset: false })
  }, [load])

  const clear = useCallback(async () => {
    try {
      await userApi.clearTaskHistory(mode)
      pageRef.current = 0
      hasMoreRef.current = false
      tasksLengthRef.current = 0
      setTasks([])
      setTotal(0)
      setHasMore(false)
      toast.success('已清空历史记录')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清空历史失败')
    }
  }, [mode])

  return { tasks, loading, loadingMore, hasMore, total, load, loadMore, clear }
}
