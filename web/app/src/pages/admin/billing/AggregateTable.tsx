import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toMoney, type AggRow } from '@/pages/admin/billing/format'

/** Revenue, cost and profit summed by one dimension: user, channel, model or day. */
export function AggregateTable({ head, rows, loading }: { head: string; rows: AggRow[]; loading: boolean }) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[720px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{head}</TableHead>
            <TableHead className='text-right'>收入（CNY）</TableHead>
            <TableHead className='text-right'>成本（CNY）</TableHead>
            <TableHead className='text-right'>利润（CNY）</TableHead>
            <TableHead className='text-right'>调用次数</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={5} title='暂无汇总数据' description='当前维度下没有可展示的账单数据。' />
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.key ?? index}>
                  <TableCell className='font-mono text-sm'>{row.key}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{toMoney(row.revenue)}</TableCell>
                  <TableCell className='text-right font-mono text-[13px] text-muted-foreground'>{toMoney(row.cost)}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{toMoney(row.profit)}</TableCell>
                  <TableCell className='text-right text-sm tabular-nums'>{row.calls?.toLocaleString('zh-CN') ?? '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
