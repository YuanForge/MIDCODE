import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { AdminLog } from '@/lib/api/admin'
import { formatCredits } from '@/lib/formatters/credits'
import { formatCallDuration } from '@/lib/formatters/duration'
import { cn } from '@/lib/utils'
import { formatTime, profitOf, statusLabel, statusTone } from '@/pages/admin/logs/logFormat'

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', wide && 'col-span-2')}>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='break-all text-sm'>{children}</dd>
    </div>
  )
}

function JsonBlock({ title, value, maxHeight = 'max-h-60' }: { title: string; value: unknown; maxHeight?: string }) {
  if (!value || (typeof value === 'object' && Object.keys(value as object).length === 0)) return null
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-sm font-medium'>{title}</h3>
      <pre className={cn('overflow-auto whitespace-pre-wrap break-all rounded-md border border-glass-border bg-glass-strong/50 p-3 text-xs', maxHeight)}>{JSON.stringify(value, null, 2)}</pre>
    </section>
  )
}

function transportLabel(transport?: string) {
  if (transport === 'ws') return 'WebSocket'
  if (transport === 'sse') return 'SSE'
  if (transport === 'http') return 'HTTP'
  return null
}

/** One call in full: the facts first, then each payload that went over the wire. If the full record cannot be loaded, the list's own row is still shown. */
export function LogDetailSheet({
  open,
  onOpenChange,
  log,
  loading,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  log: AdminLog | null
  loading: boolean
  error: string
}) {
  const profit = log ? profitOf(log) : null
  const transport = transportLabel(log?.transport)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='gap-0 overflow-y-auto data-[side=right]:w-[min(96vw,1160px)] data-[side=right]:sm:max-w-[1160px]'>
        <SheetHeader className='border-b px-6'>
          <SheetTitle>日志详情</SheetTitle>
        </SheetHeader>
        {loading ? (
          <div className='flex justify-center py-10'>
            <Loader2 className='size-8 animate-spin text-muted-foreground' />
          </div>
        ) : log ? (
          <div className='flex flex-col gap-6 px-6 py-6'>
            {error ? (
              <Alert variant='destructive'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <dl className='grid grid-cols-2 gap-4'>
              <Fact label='ID'>
                <span className='font-mono'>{log.id ?? '—'}</span>
              </Fact>
              <Fact label='状态'>
                <StatusBadge tone={statusTone(log.status)}>{statusLabel(log.status)}</StatusBadge>
              </Fact>
              <Fact label='模型' wide>
                <span className='font-medium'>{log.model ?? '—'}</span>
              </Fact>
              <Fact label='用户 ID'>{log.user_id ?? '—'}</Fact>
              <Fact label='渠道 ID'>{log.channel_id ?? '—'}</Fact>
              <Fact label='API Key ID'>{log.api_key_id ?? '—'}</Fact>
              <Fact label='流式'>{log.is_stream ? '是' : '否'}</Fact>
              <Fact label='传输协议'>{transport ? <Badge variant='outline'>{transport}</Badge> : '—'}</Fact>
              <Fact label='Corr ID' wide>
                <span className='font-mono text-xs'>{log.corr_id ?? '—'}</span>
              </Fact>
              <Fact label='上游 HTTP 状态'>{log.upstream_status ?? '—'}</Fact>
              <Fact label='上游请求方法'>{log.upstream_method ?? 'POST'}</Fact>
              <Fact label='上游 URL' wide>
                {log.upstream_url ?? '—'}
              </Fact>
              <Fact label='输入 Tokens'>{log.usage?.prompt_tokens ?? '—'}</Fact>
              <Fact label='输出 Tokens'>
                {log.usage?.completion_tokens ?? '—'}
                {log.usage?.estimated ? (
                  <Badge variant='outline' className='ml-2'>
                    估算
                  </Badge>
                ) : null}
              </Fact>
              <Fact label='缓存写入'>{log.usage?.cache_creation_tokens?.toLocaleString() ?? '—'}</Fact>
              <Fact label='缓存命中'>{log.usage?.cache_read_tokens?.toLocaleString() ?? '—'}</Fact>
              <Fact label='消耗积分'>{log.credits_charged ? `-${formatCredits(log.credits_charged)}` : '—'}</Fact>
              <Fact label='上游成本'>{log.cost_charged ? `-${formatCredits(log.cost_charged)}` : '—'}</Fact>
              <Fact label='毛利'>{profit == null ? '—' : `${profit >= 0 ? '+' : '−'}${formatCredits(Math.abs(profit))}`}</Fact>
              <Fact label='请求时间'>{formatTime(log.created_at)}</Fact>
              <Fact label='完成时间'>{formatTime(log.updated_at)}</Fact>
              <Fact label='耗时'>{formatCallDuration(log.latency_ms) ?? '—'}</Fact>
            </dl>
            {log.error_msg ? (
              <section className='flex flex-col gap-2'>
                <h3 className='text-sm font-medium'>错误信息</h3>
                <Alert variant='destructive'>
                  <AlertDescription className='whitespace-pre-wrap'>{log.error_msg}</AlertDescription>
                </Alert>
              </section>
            ) : null}
            <JsonBlock title='Token 用量详情' value={log.usage} maxHeight='max-h-40' />
            <JsonBlock title='客户端请求' value={log.client_request} />
            <JsonBlock title='上游请求头' value={log.upstream_headers} maxHeight='max-h-40' />
            <JsonBlock title='上游请求体' value={log.upstream_request} />
            <JsonBlock title='上游响应' value={log.upstream_response} />
            <JsonBlock title='客户端响应' value={log.client_response} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
