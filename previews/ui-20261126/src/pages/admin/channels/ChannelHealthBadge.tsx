import { useState, type ReactNode } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannelHealth } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

function ms(value?: number | null) {
  return value != null ? `${value.toFixed(0)}ms` : '-'
}

function Stat({ label, note, danger, children }: { label: string; note?: string; danger?: boolean; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd>
        <span className={cn('text-lg font-semibold tabular-nums', danger && 'text-destructive')}>{children}</span>
        {note ? <span className='ml-2 text-xs text-muted-foreground'>{note}</span> : null}
      </dd>
    </div>
  )
}

/** Success rate and median latency over the last day. Pressing it opens the percentiles and the most common failures. */
export function ChannelHealthBadge({ channelId }: { channelId: number }) {
  const { data, error } = useAsync(async () => {
    return adminApi.getChannelHealth(channelId)
  }, null as AdminChannelHealth | null, [channelId])
  const [open, setOpen] = useState(false)

  if (error) return <StatusBadge tone='warning'>加载失败</StatusBadge>
  if (!data || data.total === 0) return <StatusBadge tone='neutral'>无数据</StatusBadge>

  const rate = data.success_rate ?? 0
  const healthy = rate >= 95
  const failures = data.top_errors ?? []

  return (
    <>
      <button type='button' onClick={() => setOpen(true)} title='查看健康详情' className='rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
        <StatusBadge tone={healthy ? 'success' : 'danger'}>
          {rate.toFixed(0)}%{data.p50_ms != null ? ` · P50 ${ms(data.p50_ms)}` : ''}
        </StatusBadge>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>渠道 #{channelId} 健康状态（近 24h）</DialogTitle>
          </DialogHeader>
          <dl className='grid gap-6 border-y border-glass-border py-4 sm:grid-cols-3'>
            <Stat label='成功率' note={`${data.ok}/${data.total}`} danger={!healthy}>
              {rate.toFixed(1)}%
            </Stat>
            <Stat label='P50 延迟'>{ms(data.p50_ms)}</Stat>
            <Stat label='P99 延迟'>{ms(data.p99_ms)}</Stat>
          </dl>
          {failures.length > 0 ? (
            <section className='flex flex-col gap-2'>
              <h3 className='text-sm font-medium'>失败原因 TOP{failures.length}</h3>
              <ul className='divide-y divide-glass-border overflow-hidden rounded-xl border border-glass-border'>
                {failures.map((item, index) => (
                  <li key={index} className='flex items-start justify-between gap-3 py-2 text-xs'>
                    <span className='min-w-0 flex-1 break-all font-mono text-destructive'>{item.msg || '(空)'}</span>
                    <span className='shrink-0 font-medium tabular-nums text-muted-foreground'>{item.count} 次</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <Alert>
              <AlertDescription>近 24h 无失败记录</AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
