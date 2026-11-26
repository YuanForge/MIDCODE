import { ListIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminTask } from '@/lib/api/admin'
import { cn } from '@/lib/utils'
import { PAGE_SIZE, formatDateTime, isFinished, statusLabel, statusTone, typeLabel } from '@/pages/admin/tasks/taskFormat'

/** Every async task as a ruled ledger. A failed task carries a red edge and the start of its error; the rest is in the detail. */
export function TasksTable({
  rows,
  loading,
  page,
  total,
  onPage,
  onDetail,
}: {
  rows: AdminTask[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
  onDetail: (id: number) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1280px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-20'>Task ID</TableHead>
            <TableHead className='w-20'>用户 ID</TableHead>
            <TableHead className='w-20'>类型</TableHead>
            <TableHead className='w-28'>状态</TableHead>
            <TableHead className='w-20'>渠道</TableHead>
            <TableHead className='w-32 text-right'>扣费（cr）</TableHead>
            <TableHead>第三方任务 ID</TableHead>
            <TableHead className='w-48'>错误信息</TableHead>
            <TableHead className='w-44'>创建时间</TableHead>
            <TableHead className='w-44'>结束时间</TableHead>
            <TableHead className='w-16 text-center'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={11} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={11} Icon={ListIcon} title='还没有任务记录' description='平台用户发起异步任务后会汇总在此处。' />
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.id ?? index} className={cn(row.status === 'failed' && 'shadow-[inset_2px_0_0_var(--destructive)]')}>
                  <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                  <TableCell className='tabular-nums text-muted-foreground'>{row.user_id ?? '-'}</TableCell>
                  <TableCell>{typeLabel(row.type)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </TableCell>
                  <TableCell className='tabular-nums text-muted-foreground'>{row.channel_id ?? '-'}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{row.credits_charged != null ? row.credits_charged.toLocaleString() : '-'}</TableCell>
                  <TableCell className='max-w-40 truncate font-mono text-xs text-muted-foreground' title={row.upstream_task_id}>
                    {row.upstream_task_id ?? '-'}
                  </TableCell>
                  <TableCell className='max-w-48 truncate text-xs text-destructive' title={row.error_msg}>
                    {row.error_msg ? row.error_msg.slice(0, 60) + (row.error_msg.length > 60 ? '…' : '') : '-'}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{isFinished(row.status) && row.updated_at ? formatDateTime(row.updated_at) : '-'}</TableCell>
                  <TableCell className='text-center'>
                    {row.id != null ? (
                      <Button size='sm' variant='ghost' onClick={() => onDetail(row.id!)}>
                        详情
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
      {total > 0 ? <TablePagination current={page} total={total} pageSize={PAGE_SIZE} onChange={onPage} className='rounded-none border-x-0 border-b-0' /> : null}
    </div>
  )
}
