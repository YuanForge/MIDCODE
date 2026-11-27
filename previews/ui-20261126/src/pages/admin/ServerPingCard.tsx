import { useEffect, useState } from 'react'

import { PageSection } from '@/components/shared/PageSection'
import { adminApi, type AdminServerPing } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

export function ServerPingCard() {
  const [result, setResult] = useState<AdminServerPing | null>(null)
  const [error, setError] = useState('')
  const [paused, setPaused] = useState(document.hidden)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let active: AbortController | undefined

    async function poll() {
      if (disposed || document.hidden) return
      const controller = new AbortController()
      active = controller
      try {
        const next = await adminApi.getServerPing(controller.signal)
        if (!disposed && !controller.signal.aborted) {
          setResult(next)
          setError('')
        }
      } catch (err) {
        if (!disposed && !controller.signal.aborted) {
          setResult(null)
          setError(getApiErrorMessage(err))
        }
      } finally {
        if (active === controller) active = undefined
        if (!disposed && !controller.signal.aborted && !document.hidden) {
          timer = setTimeout(poll, 3000)
        }
      }
    }

    function visibilityChanged() {
      clearTimeout(timer)
      active?.abort()
      setPaused(document.hidden)
      if (!document.hidden) {
        setResult(null)
        setError('')
        void poll()
      }
    }

    document.addEventListener('visibilitychange', visibilityChanged)
    void poll()
    return () => {
      disposed = true
      clearTimeout(timer)
      active?.abort()
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [])

  const healthy = result?.status === 'ok' && result.latency_ms !== null
  const value = paused ? '已暂停' : error ? '请求失败' : !result ? '检测中…'
    : healthy ? `${result.less_than ? '< ' : ''}${result.latency_ms!.toFixed(1)} ms`
      : result.status === 'timeout' ? '超时' : '检测失败'

  return (
    <PageSection title="服务器 Ping" description="后端服务器 → sub.midaccs.com · ICMP 往返延迟">
      <div className="flex flex-wrap items-end justify-between gap-3" role="status" aria-live="polite">
        <div>
          <p className={`text-2xl font-semibold tabular-nums ${healthy && !paused ? 'text-emerald-600' : ''}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error || result?.message || '每次检测完成后 3 秒刷新；离开页面或切到后台自动停止。'}</p>
        </div>
        {result ? <p className="text-xs text-muted-foreground">更新于 {new Date(result.checked_at).toLocaleTimeString('zh-CN')}</p> : null}
      </div>
    </PageSection>
  )
}
