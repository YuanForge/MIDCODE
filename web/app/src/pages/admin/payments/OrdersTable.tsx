import { CreditCardIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminPaymentOrder } from '@/lib/api/admin'
import { cn } from '@/lib/utils'
import {
  PAGE_SIZE,
  formatDate,
  formatMoney,
  payChannelLabel,
  payFromLabel,
  sourceLabel,
  statusLabel,
  statusTone,
} from '@/pages/admin/payments/format'

/** Online top-ups and card redemptions in one ruled ledger. A failed order carries a red edge. */
export function OrdersTable({
  rows,
  loading,
  page,
  total,
  onPage,
}: {
  rows: AdminPaymentOrder[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1500px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-24'>来源</TableHead>
            <TableHead className='w-16'>ID</TableHead>
            <TableHead>用户</TableHead>
            <TableHead>单号 / 卡密</TableHead>
            <TableHead className='w-28 text-right'>金额</TableHead>
            <TableHead className='w-28 text-right'>充值额度</TableHead>
            <TableHead className='w-28 text-right'>毛利润</TableHead>
            <TableHead className='w-28'>渠道</TableHead>
            <TableHead className='w-24'>终端</TableHead>
            <TableHead className='w-24'>状态</TableHead>
            <TableHead className='w-44'>下单/兑换时间</TableHead>
            <TableHead className='w-44'>支付/兑换时间</TableHead>
            <TableHead>备注</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={13} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={13} Icon={CreditCardIcon} title='暂无记录' description='此条件下暂无充值订单或卡密兑换记录。' />
            ) : (
              rows.map((row, index) => (
                <TableRow
                  key={`${row.source ?? 'payment'}-${row.id ?? index}`}
                  className={cn(row.status === 'failed' && 'shadow-[inset_2px_0_0_var(--destructive)]')}
                >
                  <TableCell className='text-sm text-muted-foreground'>{sourceLabel(row.source)}</TableCell>
                  <TableCell className='tabular-nums'>{row.id}</TableCell>
                  <TableCell>
                    <div className='text-sm'>{row.user_email || '-'}</div>
                    <div className='text-xs text-muted-foreground'>UID {row.user_id}</div>
                  </TableCell>
                  <TableCell className='font-mono text-xs'>{row.card_code || row.out_trade_no || '-'}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{formatMoney(row.amount, 2)}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{formatMoney((row.credits ?? 0) / 1e6, 2)}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{formatMoney(row.gross_profit)}</TableCell>
                  <TableCell className='text-sm'>{payChannelLabel(row.pay_channel, row.pay_flat)}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{payFromLabel(row.pay_from)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status, row.source)}>{statusLabel(row.status, row.source)}</StatusBadge>
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatDate(row.event_time ?? row.created_at)}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {formatDate(row.paid_at ?? (row.source === 'card' ? row.event_time : undefined))}
                  </TableCell>
                  <TableCell className='max-w-48 truncate text-sm text-muted-foreground' title={row.note}>
                    {row.note || '-'}
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
