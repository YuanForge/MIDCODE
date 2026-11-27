import { useMemo } from 'react'
import type { ReactNode } from 'react'

import { CodeBlock } from '@/components/shared/CodeBlock'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { UserTask } from '@/lib/api/user'
import { cn } from '@/lib/utils'
import { TaskStatus } from '@/pages/user/tasks/TaskStatus'
import {
  collectReferenceImages,
  collectReferenceVideos,
  collectResultVideoUrls,
  firstString,
  hasContent,
  resolveStatus,
  typeLabel,
  type TaskBilling,
} from '@/pages/user/tasks/taskModel'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-3 border-t border-glass-border pt-4'>
      <h3 className='text-sm font-semibold text-foreground'>{title}</h3>
      {children}
    </section>
  )
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 border-b border-glass-border py-3', wide && 'sm:col-span-2')}>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm text-foreground'>{children}</dd>
    </div>
  )
}

function Caption({ url, children }: { url: string; children?: ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-2 px-3 py-2'>
      <span className='truncate text-xs text-muted-foreground'>{url}</span>
      {children}
    </div>
  )
}

function fmt(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

/** Task detail: the facts as a ruled statement, then prompt, media, raw parameters and the billing lines. */
export function TaskDetailDialog({
  task,
  loading,
  billing,
  onClose,
}: {
  task: UserTask | null
  loading: boolean
  billing: TaskBilling | null
  onClose: () => void
}) {
  const promptText = useMemo(() => firstString(task?.request?.prompt, task?.request?.input), [task])
  const referenceImages = useMemo(() => collectReferenceImages(task), [task])
  const referenceVideos = useMemo(() => collectReferenceVideos(task), [task])
  const resultVideos = useMemo(() => collectResultVideoUrls(task), [task])
  const note = task?.error_msg ?? task?.msg

  return (
    <Dialog open={Boolean(task)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='max-h-[80vh] overflow-y-auto sm:max-w-[960px]'>
        <DialogHeader>
          <DialogTitle>任务详情 #{task?.id ?? task?.task_id}</DialogTitle>
          <DialogDescription className='sr-only'>任务的状态、计费、参数和结果</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div aria-busy='true' className='flex flex-col gap-3 py-2'>
            <div className='h-24 w-full animate-pulse rounded-xl bg-glass-strong/60' />
            <div className='h-32 w-full animate-pulse rounded-xl bg-glass-strong/60' />
            <div className='h-16 w-full animate-pulse rounded-xl bg-glass-strong/60' />
          </div>
        ) : task ? (
          <div className='flex flex-col gap-6'>
            <dl className='grid gap-x-8 border-t border-glass-border sm:grid-cols-2'>
              <Fact label='任务 ID'>
                <strong className='tabular-nums'>{task.id ?? task.task_id}</strong>
              </Fact>
              <Fact label='类型'>{typeLabel(task.type ?? task.task_type)}</Fact>
              <Fact label='状态' wide>
                <TaskStatus status={resolveStatus(task)} />
              </Fact>
              <Fact label='消耗积分' wide>
                {task.credits_charged != null ? (
                  <span className='font-semibold tabular-nums'>−{(task.credits_charged / 1e6).toFixed(6)}</span>
                ) : (
                  '-'
                )}
              </Fact>
              <Fact label='创建时间' wide>
                {fmt(task.created_at)}
              </Fact>
              {task.finished_at ? (
                <Fact label='完成时间' wide>
                  {fmt(task.finished_at)}
                </Fact>
              ) : null}
              {task.upstream_task_id ? (
                <Fact label='上游任务 ID' wide>
                  <span className='font-mono text-xs break-all'>{task.upstream_task_id}</span>
                </Fact>
              ) : null}
              {note ? (
                <Fact label='备注' wide>
                  <span className='text-destructive'>{note}</span>
                </Fact>
              ) : null}
            </dl>

            {promptText ? (
              <Section title='提示词'>
                <p className='rounded-xl border border-glass-border bg-glass-strong/60 p-3 text-sm leading-6 break-all whitespace-pre-wrap'>{promptText}</p>
              </Section>
            ) : null}

            {referenceImages.length > 0 ? (
              <Section title='参考图片'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  {referenceImages.map((url) => (
                    <figure key={url} className='overflow-hidden rounded-md border border-glass-border bg-glass-strong/40'>
                      <img src={url} alt='reference' className='h-40 w-full object-cover' />
                      <Caption url={url} />
                    </figure>
                  ))}
                </div>
              </Section>
            ) : null}

            {referenceVideos.length > 0 ? (
              <Section title='参考视频'>
                <div className='grid gap-3'>
                  {referenceVideos.map((url) => (
                    <figure key={url} className='overflow-hidden rounded-md border border-glass-border bg-glass-strong/40'>
                      <video src={url} controls className='aspect-video w-full bg-code' />
                      <Caption url={url} />
                    </figure>
                  ))}
                </div>
              </Section>
            ) : null}

            {resultVideos.length > 0 ? (
              <Section title='结果视频'>
                <div className='grid gap-3'>
                  {resultVideos.map((url) => (
                    <figure key={url} className='overflow-hidden rounded-md border border-glass-border bg-glass-strong/40'>
                      <video src={url} controls className='aspect-video w-full bg-code' />
                      <Caption url={url}>
                        <a href={url} target='_blank' rel='noopener noreferrer' className='shrink-0 text-xs text-brand underline-offset-4 hover:underline'>
                          打开
                        </a>
                      </Caption>
                    </figure>
                  ))}
                </div>
              </Section>
            ) : null}

            {hasContent(task.request) ? (
              <CodeBlock title='请求参数' code={JSON.stringify(task.request, null, 2)} wrap bodyClassName='max-h-[320px]' />
            ) : null}
            {hasContent(task.result) ? (
              <CodeBlock title='结果' code={JSON.stringify(task.result, null, 2)} wrap bodyClassName='max-h-[320px]' />
            ) : null}

            {billing?.transactions && billing.transactions.length > 0 ? (
              <Section title='账单明细'>
                <div className='overflow-hidden rounded-xl border border-glass-border'>
                  <Table className='min-w-[560px] text-xs'>
                    <TableHeader>
                      <TableRow>
                        <TableHead>类型</TableHead>
                        <TableHead className='text-right'>积分</TableHead>
                        <TableHead className='text-right'>余额后</TableHead>
                        <TableHead className='text-right'>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billing.transactions.map((tx, index) => (
                        <TableRow key={tx.id ?? index}>
                          <TableCell>{tx.type ?? '-'}</TableCell>
                          <TableCell className='text-right font-mono'>{tx.credits != null ? (tx.credits / 1e6).toFixed(6) : '-'}</TableCell>
                          <TableCell className='text-right font-mono'>{tx.balance_after != null ? (tx.balance_after / 1e6).toFixed(4) : '-'}</TableCell>
                          <TableCell className='text-right text-muted-foreground'>{fmt(tx.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
