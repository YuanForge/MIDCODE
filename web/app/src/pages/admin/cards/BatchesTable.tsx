import { CreditCardIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminCardBatch } from '@/lib/api/admin'
import { formatTime, yuan } from '@/pages/admin/cards/cardFormat'

/** Batches of generated cards. The one action voids every card in a batch that has not been used yet. */
export function BatchesTable({
  rows,
  loading,
  onVoid,
}: {
  rows: AdminCardBatch[]
  loading: boolean
  onVoid: (batchId: string) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[860px]'>
        <TableHeader>
          <TableRow>
            <TableHead>批次 ID</TableHead>
            <TableHead>备注</TableHead>
            <TableHead className='w-28 text-right'>面值（¥）</TableHead>
            <TableHead className='w-20 text-right'>总数</TableHead>
            <TableHead className='w-20 text-right'>已用</TableHead>
            <TableHead className='w-44'>生成时间</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={7} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={7} Icon={CreditCardIcon} title='暂无批次' description='生成卡密后批次会显示在这里。' />
            ) : (
              rows.map((row) => (
                <TableRow key={row.id ?? row.batch_id}>
                  <TableCell className='font-mono text-xs'>{row.batch_id}</TableCell>
                  <TableCell>{row.note || '-'}</TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{yuan(row.credits, 2)}</TableCell>
                  <TableCell className='text-right tabular-nums'>{row.count}</TableCell>
                  <TableCell className='text-right tabular-nums'>{row.used ?? 0}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' className='text-destructive' onClick={() => row.batch_id && onVoid(row.batch_id)}>
                      整批作废未用
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
