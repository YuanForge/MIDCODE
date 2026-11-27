import { WalletCardsIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminTransaction } from '@/lib/api/admin'
import { PAGE_SIZE, formatMoney, isDebit, profitOf, typeLabel } from '@/pages/admin/billing/format'

/** The record a transaction came from: an LLM call or a task, linked to its page when there is one. */
function Related({ row }: { row: AdminTransaction }) {
  const link = 'underline underline-offset-2 hover:text-foreground'
  if (row.llm_log_id) {
    return (
      <a href={`/admin/llm-logs?id=${row.llm_log_id}`} className={link}>
        {row.corr_id}
      </a>
    )
  }
  if (row.task_id) {
    return (
      <a href={`/admin/tasks?id=${row.task_id}`} className={link}>
        {row.corr_id}
      </a>
    )
  }
  return <>{row.corr_id ?? '-'}</>
}

/** Every credit movement as a ruled ledger. Debits and credits are told apart by their sign, not by colour. */
export function TransactionsTable({
  rows,
  loading,
  page,
  total,
  onPage,
}: {
  rows: AdminTransaction[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1040px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-14'>ID</TableHead>
            <TableHead className='w-20'>用户 ID</TableHead>
            <TableHead className='w-32'>类型</TableHead>
            <TableHead className='w-36 text-right'>金额（CNY）</TableHead>
            <TableHead className='w-32 text-right'>成本（CNY）</TableHead>
            <TableHead className='w-32 text-right'>利润（CNY）</TableHead>
            <TableHead className='w-16'>渠道</TableHead>
            <TableHead>关联 ID</TableHead>
            <TableHead className='w-44'>时间</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={9} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={9} Icon={WalletCardsIcon} title='还没有账单记录' description='平台累计的所有积分流水会汇总在此处。' />
            ) : (
              rows.map((row, index) => {
                const amount = Math.abs(row.amount ?? 0)
                return (
                  <TableRow key={row.id ?? index}>
                    <TableCell className='tabular-nums text-muted-foreground'>{row.id ?? '-'}</TableCell>
                    <TableCell className='tabular-nums text-muted-foreground'>{row.user_id ?? '-'}</TableCell>
                    <TableCell>
                      <span className='text-sm'>{typeLabel(row.type)}</span>
                      {(row.model_credit_charged ?? 0) > 0 ? (
                        <Badge variant='outline' className='ml-2 text-xs'>
                          专属积分
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>
                      {isDebit(row.type) ? '-' : '+'}
                      {formatMoney(amount)}
                    </TableCell>
                    <TableCell className='text-right font-mono text-[13px] text-muted-foreground'>{formatMoney(row.cost)}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatMoney(profitOf(row))}</TableCell>
                    <TableCell className='tabular-nums text-muted-foreground'>{row.channel_id ?? '-'}</TableCell>
                    <TableCell className='max-w-32 truncate text-xs text-muted-foreground' title={row.corr_id}>
                      <Related row={row} />
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        )}
      </Table>
      {total > 0 ? <TablePagination current={page} total={total} pageSize={PAGE_SIZE} onChange={onPage} className='rounded-none border-x-0 border-b-0' /> : null}
    </div>
  )
}
