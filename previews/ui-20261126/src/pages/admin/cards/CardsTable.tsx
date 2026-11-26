import { CreditCardIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminCard } from '@/lib/api/admin'
import { copyToClipboard } from '@/lib/clipboard'
import { CARD_PAGE_SIZE, formatTime, statusLabel, statusTone, yuan } from '@/pages/admin/cards/cardFormat'

/** Every card as a ruled ledger. Clicking a code copies it; only an unused card can be voided or deleted. */
export function CardsTable({
  rows,
  loading,
  page,
  total,
  onPage,
  onVoid,
  onDelete,
}: {
  rows: AdminCard[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
  onVoid: (id: number) => void
  onDelete: (card: AdminCard) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[960px]'>
        <TableHeader>
          <TableRow>
            <TableHead>兑换码</TableHead>
            <TableHead className='text-right'>面值</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>备注</TableHead>
            <TableHead>生成时间</TableHead>
            <TableHead>使用时间</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={7} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={7} Icon={CreditCardIcon} title='还没有卡密' description='使用右上角「生成卡密」创建后会显示在这里。' />
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.id ?? index}>
                  <TableCell>
                    <button
                      type='button'
                      className='font-mono text-xs hover:text-primary focus-visible:text-primary focus-visible:outline-none'
                      onClick={() => void copyToClipboard(row.code ?? '', { successMessage: '兑换码已复制' })}
                      aria-label={`复制兑换码 ${row.code ?? ''}`}
                    >
                      {row.code ?? '-'}
                    </button>
                  </TableCell>
                  <TableCell className='text-right font-mono text-[13px]'>{yuan(row.credits)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{row.note ?? '-'}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{row.used_at ? formatTime(row.used_at) : '—'}</TableCell>
                  <TableCell className='text-right'>
                    {row.status === 'unused' && row.id != null ? (
                      <div className='flex justify-end gap-2'>
                        <Button size='sm' variant='outline' className='text-destructive' onClick={() => onVoid(row.id!)}>
                          作废
                        </Button>
                        <Button size='sm' variant='outline' onClick={() => onDelete(row)}>
                          删除
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
      {total > 0 ? <TablePagination current={page} total={total} pageSize={CARD_PAGE_SIZE} onChange={onPage} className='rounded-none border-x-0 border-b-0' /> : null}
    </div>
  )
}
