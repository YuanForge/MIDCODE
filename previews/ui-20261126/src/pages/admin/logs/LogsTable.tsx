import { FileClockIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminLog } from '@/lib/api/admin'
import { formatCredits } from '@/lib/formatters/credits'
import { cn } from '@/lib/utils'
import { PAGE_SIZE, formatTime, statusLabel, statusTone } from '@/pages/admin/logs/logFormat'

function Dash() {
  return <span className='text-muted-foreground/50'>—</span>
}

function Usage({ row }: { row: AdminLog }) {
  const usage = row.usage
  if (!usage) return <Dash />
  const cached = usage.cache_creation_tokens || usage.cache_read_tokens
  return (
    <div className='flex flex-col gap-1 text-xs'>
      <span>
        ↑{usage.prompt_tokens?.toLocaleString() ?? '-'} / ↓{usage.completion_tokens?.toLocaleString() ?? '-'}
      </span>
      {cached ? (
        <span className='text-muted-foreground'>
          写缓存 {usage.cache_creation_tokens?.toLocaleString() ?? 0} / 命缓存 {usage.cache_read_tokens?.toLocaleString() ?? 0}
        </span>
      ) : null}
    </div>
  )
}

/** Every call the platform handled, one per row. A failed call carries a red edge; details open in a side sheet. */
export function LogsTable({
  rows,
  loading,
  page,
  total,
  onPage,
  onDetail,
}: {
  rows: AdminLog[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
  onDetail: (row: AdminLog) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1660px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[60px]'>ID</TableHead>
            <TableHead>模型</TableHead>
            <TableHead>用户 ID</TableHead>
            <TableHead>用户名</TableHead>
            <TableHead>渠道 ID</TableHead>
            <TableHead>上游 API Key</TableHead>
            <TableHead>相关 ID</TableHead>
            <TableHead className='text-right'>Token 用量</TableHead>
            <TableHead className='text-right'>消耗积分</TableHead>
            <TableHead className='text-right'>上游成本</TableHead>
            <TableHead className='text-center'>上游状态</TableHead>
            <TableHead className='text-center'>状态</TableHead>
            <TableHead>时间</TableHead>
            <TableHead className='text-center'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={14} rows={10} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={14} Icon={FileClockIcon} title='还没有调用日志' description='所有 LLM 调用记录会在此处汇总。' />
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.id ?? index} className={cn(row.status === 'error' && 'shadow-[inset_2px_0_0_var(--destructive)]')}>
                  <TableCell className='tabular-nums text-muted-foreground'>{row.id ?? '-'}</TableCell>
                  <TableCell className='max-w-[180px] truncate font-medium' title={row.model}>
                    {row.model ?? '-'}
                  </TableCell>
                  <TableCell className='tabular-nums text-muted-foreground'>{row.user_id ?? '-'}</TableCell>
                  <TableCell className='text-muted-foreground'>{row.username ?? '-'}</TableCell>
                  <TableCell className='tabular-nums text-muted-foreground'>{row.channel_id ?? '-'}</TableCell>
                  <TableCell className='max-w-[180px] truncate font-mono text-xs text-muted-foreground' title={row.upstream_api_key}>
                    {row.upstream_api_key ?? '-'}
                  </TableCell>
                  <TableCell className='max-w-[220px] truncate font-mono text-xs text-muted-foreground' title={row.corr_id}>
                    {row.corr_id ?? '-'}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    <Usage row={row} />
                  </TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{row.credits_charged ? `-${formatCredits(row.credits_charged)}` : <Dash />}</TableCell>
                  <TableCell className='text-right font-mono text-[13px] text-muted-foreground'>{row.cost_charged ? `-${formatCredits(row.cost_charged)}` : <Dash />}</TableCell>
                  <TableCell className='text-center tabular-nums'>{row.upstream_status ?? <Dash />}</TableCell>
                  <TableCell className='text-center'>
                    <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                  <TableCell className='text-center'>
                    <Button variant='ghost' size='sm' onClick={() => onDetail(row)}>
                      详情
                    </Button>
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
