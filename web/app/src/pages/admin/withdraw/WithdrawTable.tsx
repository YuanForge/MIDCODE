import { WalletIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminWithdrawal } from '@/lib/api/admin'
import {
  PAGE_SIZE,
  canCsReview,
  canFinanceReview,
  formatAmount,
  formatTime,
  payTypeLabel,
  stageLabel,
  stageTone,
  statusLabel,
  statusTone,
} from '@/pages/admin/withdraw/format'

export type RowHandlers = {
  onQr: (row: AdminWithdrawal) => void
  onProof: (row: AdminWithdrawal) => void
  onCsApprove: (row: AdminWithdrawal) => void
  onApprove: (row: AdminWithdrawal) => void
  onReject: (row: AdminWithdrawal) => void
}

function RowActions({ row, onQr, onProof, onCsApprove, onApprove, onReject }: RowHandlers & { row: AdminWithdrawal }) {
  const cs = canCsReview(row)
  const finance = canFinanceReview(row)
  return (
    <div className='flex justify-end gap-2'>
      <Button size='sm' variant='outline' onClick={() => onQr(row)}>
        查看收款码
      </Button>
      {row.proof_url ? (
        <Button size='sm' variant='outline' onClick={() => onProof(row)}>
          查看打款证明
        </Button>
      ) : null}
      {cs ? (
        <Button size='sm' variant='outline' onClick={() => onCsApprove(row)}>
          初审通过
        </Button>
      ) : null}
      {finance ? (
        <Button size='sm' variant='outline' onClick={() => onApprove(row)}>
          复审通过
        </Button>
      ) : null}
      {cs || finance ? (
        <Button size='sm' variant='outline' className='text-destructive' onClick={() => onReject(row)}>
          驳回
        </Button>
      ) : null}
    </div>
  )
}

/** Withdrawals as a ruled ledger; which actions a row offers follows its review stage. */
export function WithdrawTable({
  rows,
  loading,
  page,
  total,
  onPage,
  handlers,
}: {
  rows: AdminWithdrawal[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
  handlers: RowHandlers
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1180px]'>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>用户</TableHead>
            <TableHead>申请时间</TableHead>
            <TableHead className='text-right'>金额</TableHead>
            <TableHead>收款方式</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>审批阶段</TableHead>
            <TableHead>备注</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={9} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={9} Icon={WalletIcon} title='还没有提现申请' description='号商提交提现后会在这里出现，请审核后再处理。' />
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.id ?? index}>
                  <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                  <TableCell>{row.username ?? '-'}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{formatAmount(row.amount)}</TableCell>
                  <TableCell>{payTypeLabel(row.payment_type)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    {stageLabel(row.review_stage) ? (
                      <StatusBadge tone={stageTone(row.review_stage)}>{stageLabel(row.review_stage)}</StatusBadge>
                    ) : (
                      <span className='text-muted-foreground'>-</span>
                    )}
                  </TableCell>
                  <TableCell className='max-w-40 truncate text-xs text-muted-foreground' title={row.admin_remark}>
                    {row.admin_remark ?? '-'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <RowActions row={row} {...handlers} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
      {total > 0 ? (
        <TablePagination current={page} total={total} pageSize={PAGE_SIZE} onChange={onPage} className='rounded-none border-x-0 border-b-0' />
      ) : null}
    </div>
  )
}
