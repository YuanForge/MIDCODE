import { useState } from 'react'
import { ReceiptTextIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { StatusBadge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { userApi, type PaymentOrder } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'

const PAGE_SIZE = 20

const STATUS_LABELS: Record<string, string> = {
  pending: '待支付',
  paid: '已完成',
  failed: '失败',
}

function statusTone(status: string) {
  if (status === 'paid') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

function channelLabel(row: PaymentOrder) {
  if (row.pay_channel === 'shouqianba_wechat') return '收钱吧-微信'
  if (row.pay_channel === 'shouqianba_alipay') return '收钱吧-支付宝'
  if (row.pay_channel) return row.pay_channel
  if (row.pay_flat === 1) return 'wechat'
  if (row.pay_flat === 2) return 'alipay'
  return 'epay'
}

/** Recharge orders: amount paid, credits received, channel and state, as a bare ruled table. */
export function OrdersPanel() {
  const [page, setPage] = useState(1)
  const { data } = useAsync(
    async () => {
      const res = await userApi.getPaymentOrders(page, PAGE_SIZE)
      return { items: (res.orders ?? []) as PaymentOrder[], total: res.total ?? 0 }
    },
    { items: [] as PaymentOrder[], total: 0 },
    [page],
  )

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <h2 className='text-[15px] font-semibold text-foreground'>充值订单</h2>
        <p className='text-[13px] text-muted-foreground'>充值金额、到账积分、支付渠道和订单状态</p>
      </div>
      <div className='glass overflow-hidden'>
        <Table className='min-w-[820px]'>
          <TableHeader>
            <TableRow>
              <TableHead>订单号</TableHead>
              <TableHead className='text-right'>充值金额</TableHead>
              <TableHead className='text-right'>到账积分</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>支付时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableEmpty
                cols={6}
                Icon={ReceiptTextIcon}
                title='暂无订单记录'
                description='发起在线支付后，订单会显示在这里。'
              />
            ) : (
              data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='font-mono text-xs'>{row.out_trade_no}</TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>¥{row.amount.toFixed(2)}</TableCell>
                  <TableCell className='text-right font-mono text-[13px] text-success'>
                    {row.credits ? `+${formatCredits(row.credits)}` : '—'}
                  </TableCell>
                  <TableCell className='text-[13px] text-muted-foreground'>{channelLabel(row)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>
                      {STATUS_LABELS[row.status] ?? (row.status || '未知')}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className='text-[13px] text-muted-foreground'>{row.paid_at || row.created_at}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {data.total > 0 ? (
        <TablePagination current={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
      ) : null}
    </div>
  )
}
