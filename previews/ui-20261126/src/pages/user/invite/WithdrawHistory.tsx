import { WalletIcon } from 'lucide-react'

import { Section } from '@/components/shared/Section'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { WithdrawRecord } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'

function statusBadge(status: string | undefined) {
  if (status === 'pending') return <StatusBadge tone='warning'>待审核</StatusBadge>
  if (status === 'approved') return <StatusBadge tone='success'>已通过</StatusBadge>
  if (status === 'rejected') return <StatusBadge tone='danger'>已拒绝</StatusBadge>
  return <Badge variant='outline'>{status ?? '-'}</Badge>
}

function paymentTypeLabel(type: string | undefined) {
  if (type === 'wechat') return '微信'
  if (type === 'alipay') return '支付宝'
  return type ?? '-'
}

export function WithdrawHistory({
  rows,
  loading,
  total,
  page,
  pageSize,
  onPage,
}: {
  rows: WithdrawRecord[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  onPage: (next: number) => void
}) {
  return (
    <Section title='提现记录' description='提现积分、收款方式、审核状态与管理员备注'>
      <div className='glass overflow-hidden'>
        <Table className='min-w-[760px]'>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead className='text-right'>积分数量</TableHead>
              <TableHead>收款方式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={5} rows={3} />
          ) : (
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty cols={5} Icon={WalletIcon} title='暂无提现记录' description='保存收款码后即可申请提现，审核结果会显示在这里。' />
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell className='text-[13px] text-muted-foreground'>
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatCredits(row.amount ?? 0)}</TableCell>
                    <TableCell>{paymentTypeLabel(row.payment_type)}</TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell className='text-[13px] text-muted-foreground'>{row.admin_remark ?? '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>
      {!loading && total > pageSize ? (
        <TablePagination current={page} total={total} pageSize={pageSize} onChange={onPage} className='mt-4' />
      ) : null}
    </Section>
  )
}
