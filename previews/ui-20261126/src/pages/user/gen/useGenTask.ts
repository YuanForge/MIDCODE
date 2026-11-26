import { useEffect, useRef, useState } from 'react'

export type TaskPhase = 'idle' | 'polling' | 'done' | 'failed'
export type TaskVerdict<T> = { phase: 'pending' } | { phase: 'done'; result: T } | { phase: 'failed'; message: string }

/**
 * One asynchronous generation task. `start` begins polling /v1/tasks/{id} every 3 seconds; the page's
 * `interpret` function reads each response and says whether the task is still running, done or failed.
 */
export function useGenTask<T>({
  headers,
  interpret,
  onFinished,
}: {
  headers: HeadersInit | null | undefined
  interpret: (raw: unknown) => TaskVerdict<T>
  onFinished?: () => void
}) {
  const [taskId, setTaskId] = useState('')
  const [phase, setPhase] = useState<TaskPhase>('idle')
  const [result, setResult] = useState<T | null>(null)
  const [message, setMessage] = useState('')
  const latest = useRef({ interpret, onFinished })

  useEffect(() => {
    latest.current = { interpret, onFinished }
  })

  useEffect(() => {
    if (!taskId || phase !== 'polling' || !headers) return
    let cancelled = false

    const tick = async () => {
      try {
        const response = await fetch(`/v1/tasks/${taskId}`, { headers })
        if (!response.ok || cancelled) return
        const verdict = latest.current.interpret(await response.json())
        if (cancelled || verdict.phase === 'pending') return
        if (verdict.phase === 'done') {
          setResult(verdict.result)
          setPhase('done')
          latest.current.onFinished?.()
        } else {
          setMessage(verdict.message)
          setPhase('failed')
        }
      } catch {
        // ignore a single failed poll
      }
    }

    const timer = setInterval(() => void tick(), 3000)
    void tick()
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [taskId, phase, headers])

  return {
    taskId,
    phase,
    result,
    message,
    start: (id: string) => {
      setTaskId(id)
      setResult(null)
      setMessage('')
      setPhase('polling')
    },
    finish: (value: T) => {
      setResult(value)
      setPhase('done')
    },
    fail: (text: string) => {
      setMessage(text)
      setPhase('failed')
    },
    reset: () => {
      setTaskId('')
      setResult(null)
      setMessage('')
      setPhase('idle')
    },
  }
}
