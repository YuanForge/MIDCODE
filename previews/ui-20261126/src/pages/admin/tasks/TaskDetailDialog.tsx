import { useEffect, type ReactNode } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminTask } from '@/lib/api/admin'
import { cn } from '@/lib/utils'
import {
  formatDateTime,
  isActive,
  isFinished,
  pollBody,
  statusLabel,
  statusTone,
  typeLabel,
  upstreamBody,
  upstreamHeaders,
  upstreamUrl,
} from '@/pages/admin/tasks/taskFormat'

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', wide && 'col-span-2')}>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='break-all text-sm'>{children}</dd>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-sm font-medium'>{title}</h3>
      <pre className='max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border border-glass-border bg-glass-strong/50 p-3 font-mono text-xs leading-relaxed'>{children}</pre>
    </section>
  )
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (!value || (typeof value === 'object' && Object.keys(value as object).length === 0)) return null
  return <Block title={title}>{JSON.stringify(value, null, 2)}</Block>
}

/**
 * One task in full: the facts first, then each payload that went over the wire.
 * The page mounts this only while a task is open. A task that is still queued or running refreshes every 3 seconds until it finishes.
 */
export function TaskDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: task, loading, error, reload } = useAsync<AdminTask | null>(async () => {
    const res = await adminApi.getAdminTask(id)
    const found: AdminTask = (res as { task?: AdminTask }).task ?? (res as AdminTask)
    return found
  }, null, [id])

  const active = isActive(task?.status)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => reload(), 3000)
    return () => window.clearInterval(timer)
  }, [active, reload])

  const url = upstreamUrl(task?.upstream_request)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='max-h-[80vh] overflow-y-auto sm:max-w-[872px]'>
        <DialogHeader>
          <DialogTitle>任务详情 #{id}</DialogTitle>
          <DialogDescription>{active ? '任务进行中，每 3 秒自动刷新。' : '完整的请求与响应，用于对接排障。'}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading && !task ? (
          <div className='flex flex-col gap-3'>
            <Skeleton className='h-24 w-full' />
            <Skeleton className='h-32 w-full' />
            <Skeleton className='h-16 w-full' />
          </div>
        ) : task ? (
          <div className='flex flex-col gap-5'>
            <dl className='grid grid-cols-2 gap-x-6 gap-y-4 border-y border-glass-border py-4'>
              <Fact label='Task ID'>{task.id}</Fact>
              <Fact label='用户 ID'>{task.user_id ?? '-'}</Fact>
              <Fact label='任务类型'>{typeLabel(task.type)}</Fact>
              <Fact label='状态'>
                <StatusBadge tone={statusTone(task.status)}>{statusLabel(task.status)}</StatusBadge>
              </Fact>
              <Fact label='渠道 ID'>{task.channel_id ?? '-'}</Fact>
              <Fact label='扣费'>{task.credits_charged != null ? `${task.credits_charged.toLocaleString()} cr` : '-'}</Fact>
              {task.upstream_task_id ? (
                <Fact label='第三方任务 ID' wide>
                  <span className='font-mono text-xs'>{task.upstream_task_id}</span>
                </Fact>
              ) : null}
              <Fact label='创建时间' wide>
                {formatDateTime(task.created_at)}
              </Fact>
              {isFinished(task.status) && task.updated_at ? (
                <Fact label='完成时间' wide>
                  {formatDateTime(task.updated_at)}
                </Fact>
              ) : null}
            </dl>
            {task.error_msg ? (
              <Alert variant='destructive'>
                <AlertDescription className='whitespace-pre-wrap break-words'>{task.error_msg}</AlertDescription>
              </Alert>
            ) : null}
            <JsonBlock title='用户提交请求体' value={task.request} />
            {url ? <Block title='上游请求 URL'>{url}</Block> : null}
            <JsonBlock title='上游请求头' value={upstreamHeaders(task.upstream_request)} />
            <JsonBlock title='首次发送给第三方的请求体' value={upstreamBody(task.upstream_request)} />
            <JsonBlock title='轮询第三方任务请求体' value={pollBody(task.upstream_request)} />
            <JsonBlock title='第三方原始响应体' value={task.upstream_response} />
            <JsonBlock title='平台标准结果' value={task.result} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
