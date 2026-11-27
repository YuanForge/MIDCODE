import { RefreshCwIcon, ServerIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminResellerBuildJob, AdminResellerSite } from '@/lib/api/admin'
import { cn } from '@/lib/utils'
import { formatTime, statusLabel, statusTone } from '@/pages/admin/resellers/format'

const FAILED_EDGE = 'shadow-[inset_2px_0_0_var(--destructive)]'

/** Proxy sites and the resources each one was given. A failed site carries a red edge. */
export function SitesTable({ rows, loading }: { rows: AdminResellerSite[]; loading: boolean }) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1180px]'>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>代理商</TableHead>
            <TableHead>站点</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>DB</TableHead>
            <TableHead>Redis</TableHead>
            <TableHead className='text-right'>端口</TableHead>
            <TableHead>NATS</TableHead>
            <TableHead>目录</TableHead>
            <TableHead>创建时间</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={10} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={10} Icon={ServerIcon} title='还没有代理站' />
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.id ?? index} className={cn(row.status === 'failed' && FAILED_EDGE)}>
                  <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                  <TableCell className='tabular-nums'>{row.reseller_id ?? '-'}</TableCell>
                  <TableCell>
                    <div>{row.site_name ?? '-'}</div>
                    <div className='font-mono text-xs text-muted-foreground'>{row.site_code ?? '-'}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </TableCell>
                  <TableCell className='font-mono text-xs'>{row.db_name ?? '-'}</TableCell>
                  <TableCell className='font-mono text-xs'>{row.redis_db ?? '-'}</TableCell>
                  <TableCell className='text-right font-mono text-xs tabular-nums'>{row.app_port ?? '-'}</TableCell>
                  <TableCell className='max-w-[180px] truncate font-mono text-xs'>{row.nats_namespace ?? '-'}</TableCell>
                  <TableCell className='max-w-[260px] truncate font-mono text-xs text-muted-foreground'>{row.code_path ?? '-'}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}

/** Build jobs behind the sites. Only a failed job can be retried, and its error stays in the row. */
export function JobsTable({
  rows,
  loading,
  onRetry,
}: {
  rows: AdminResellerBuildJob[]
  loading: boolean
  onRetry: (job: AdminResellerBuildJob) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[980px]'>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>站点</TableHead>
            <TableHead>代理商</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>步骤</TableHead>
            <TableHead>错误</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={8} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={8} Icon={RefreshCwIcon} title='还没有搭建任务' />
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.id ?? index} className={cn(row.status === 'failed' && FAILED_EDGE)}>
                  <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                  <TableCell className='tabular-nums'>{row.site_id ?? '-'}</TableCell>
                  <TableCell className='tabular-nums'>{row.reseller_id ?? '-'}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </TableCell>
                  <TableCell>{statusLabel(row.step)}</TableCell>
                  <TableCell className='max-w-[280px] truncate text-xs text-destructive' title={row.error || undefined}>
                    {row.error || '-'}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' onClick={() => onRetry(row)} disabled={row.status !== 'failed'}>
                      <RefreshCwIcon data-icon='inline-start' />
                      重试
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
