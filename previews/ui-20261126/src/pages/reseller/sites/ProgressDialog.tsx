import { RefreshCwIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { ResellerBuildJob, ResellerSite } from '@/lib/api/reseller'
import { cn } from '@/lib/utils'
import { formatTime, statusLabel, statusTone } from '@/pages/reseller/sites/status'

function Stamp({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='truncate text-sm'>{value}</dd>
    </div>
  )
}

/** Build jobs of one site, newest as the server returns them. A failed job carries a red edge and its error text. */
export function ProgressDialog({
  open,
  onOpenChange,
  site,
  jobs,
  loading,
  error,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: ResellerSite | null
  jobs: ResellerBuildJob[]
  loading: boolean
  error: string
  onRefresh: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>搭建进度</DialogTitle>
          <DialogDescription>{site?.site_name ?? '-'}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <div className='flex flex-col gap-2'>
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
          </div>
        ) : jobs.length === 0 ? (
          <p className='text-sm text-muted-foreground'>暂无构建任务记录。</p>
        ) : (
          <ol className='flex max-h-[60vh] flex-col divide-y divide-glass-border overflow-y-auto rounded-xl border border-glass-border'>
            {jobs.map((job) => (
              <li key={job.id} className={cn('flex flex-col gap-3 py-3', job.status === 'failed' && 'pl-3 shadow-[inset_2px_0_0_var(--destructive)]')}>
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-sm font-medium tabular-nums'>任务 #{job.id}</span>
                  <StatusBadge tone={statusTone(job.status)}>{statusLabel(job.status)}</StatusBadge>
                </div>
                <dl className='grid gap-3 sm:grid-cols-2'>
                  <Stamp label='步骤' value={job.step ?? '-'} />
                  <Stamp label='创建' value={formatTime(job.created_at)} />
                  <Stamp label='开始' value={formatTime(job.started_at)} />
                  <Stamp label='结束' value={formatTime(job.finished_at)} />
                </dl>
                {job.error ? <p className='break-words text-xs text-destructive'>{job.error}</p> : null}
              </li>
            ))}
          </ol>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {site?.id ? (
            <Button onClick={onRefresh} disabled={loading}>
              <RefreshCwIcon data-icon='inline-start' />
              刷新
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
