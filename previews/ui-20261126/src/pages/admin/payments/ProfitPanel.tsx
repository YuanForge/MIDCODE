import { CreditCardIcon } from 'lucide-react'

import { Readout } from '@/components/shared/Readout'
import { Section } from '@/components/shared/Section'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminPaymentDailySummary, AdminPaymentSummary } from '@/lib/api/admin'
import { formatMoney } from '@/pages/admin/payments/format'

/** Gross profit for the filtered range, split into online top-ups and card redemptions. */
export function ProfitReadouts({ summary, loading }: { summary: AdminPaymentSummary; loading: boolean }) {
  return (
    <div className='glass grid gap-8 p-6 sm:grid-cols-3'>
      <Readout size='md' label='毛利润合计' value={formatMoney(summary.gross_profit)} loading={loading} />
      <Readout size='md' label='在线充值毛利' value={formatMoney(summary.payment_gross_profit)} loading={loading} />
      <Readout size='md' label='卡密兑换毛利' value={formatMoney(summary.card_gross_profit)} loading={loading} />
    </div>
  )
}

/** The same profit, one row per day. */
export function DailyProfit({ daily, loading }: { daily: AdminPaymentDailySummary[]; loading: boolean }) {
  return (
    <Section title='每日毛利润'>
      <div className='glass max-h-[260px] overflow-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead className='text-right'>合计</TableHead>
              <TableHead className='text-right'>在线</TableHead>
              <TableHead className='text-right'>卡密</TableHead>
              <TableHead className='text-right'>笔数</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={5} rows={3} />
          ) : (
            <TableBody>
              {daily.length === 0 ? (
                <TableEmpty cols={5} Icon={CreditCardIcon} title='暂无毛利润' description='有已支付订单或卡密兑换后会显示每日汇总。' />
              ) : (
                daily.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell className='font-mono text-sm'>{row.day}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatMoney(row.gross_profit)}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatMoney(row.payment_gross_profit)}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatMoney(row.card_gross_profit)}</TableCell>
                    <TableCell className='text-right text-sm tabular-nums text-muted-foreground'>{row.count ?? 0}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>
    </Section>
  )
}
