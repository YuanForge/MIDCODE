import { useCallback, useEffect, useRef, useState } from 'react'

import { userApi, type UserTask } from '@/lib/api/user'
import { isRunning, resolveStatus, type TaskBilling } from '@/pages/user/tasks/taskModel'

function unwrap(res: unknown): UserTask {
  return (res as { task?: UserTask }).task ?? (res as UserTask)
}

/**
 * Task detail with its billing. While the task is still queued or running the detail is refreshed every
 * 3 seconds, and the refresh stops by itself once the task reaches a final state or the dialog closes.
 */
export function useTaskDetail() {
  const [detail, setDetail] = useState<UserTask | null>(null)
  const [loading, setLoading] = useState(false)
  const [billing, setBilling] = useState<TaskBilling | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => stop, [stop])

  const open = useCallback(
    async (id: number) => {
      setLoading(true)
      setBilling(null)
      stop()
      try {
        const task = unwrap(await userApi.getTask(id))
        setDetail(task)
        userApi
          .getTaskBilling(id)
          .then((result) => setBilling(result))
          .catch(() => null)
        if (isRunning(resolveStatus(task))) {
          timerRef.current = setInterval(async () => {
            const next = unwrap(await userApi.getTask(id))
            setDetail(next)
            if (!isRunning(resolveStatus(next))) stop()
          }, 3000)
        }
      } finally {
        setLoading(false)
      }
    },
    [stop],
  )

  const close = useCallback(() => {
    stop()
    setDetail(null)
    setBilling(null)
  }, [stop])

  return { detail, loading, billing, open, close }
}
