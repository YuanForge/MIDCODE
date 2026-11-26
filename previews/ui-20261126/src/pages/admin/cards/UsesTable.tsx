import { CreditCardIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminCard } from '@/lib/api/admin'
import { formatTime, yuan } from '@/pages/admin/cards/cardFormat'

/** Cards that have been redeemed, and who redeemed them. */
export function UsesTable({ rows, loading }: { rows: AdminCard[]; loading: boolean }) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[760px]'>
        <TableHeader>
          <TableRow>
            <TableHead>兑换码</TableHead>
            <TableHead className='text-right'>面值</TableHead>
            <TableHead>兑换用户 ID</TableHead>
            <TableHead>兑换时间</TableHead>
            <TableHead>备注</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={5} Icon={CreditCardIcon} title='暂无兑换记录' description='有用户兑换卡密后将显示在此。' />
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='font-mono text-xs'>{row.code ?? '-'}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{yuan(row.credits)}</TableCell>
                  <TableCell className='tabular-nums text-muted-foreground'>{row.used_by ? `#${row.used_by}` : '-'}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatTime(row.used_at)}</TableCell>
                  <TableCell className='text-muted-foreground'>{row.note ?? '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
