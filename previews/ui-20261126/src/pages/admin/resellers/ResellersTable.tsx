import { BriefcaseBusinessIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminReseller } from '@/lib/api/admin'
import { formatTime } from '@/pages/admin/resellers/format'

/** Reseller accounts as a ruled ledger; the one action is switching an account on or off. */
export function ResellersTable({
  rows,
  loading,
  onToggle,
}: {
  rows: AdminReseller[]
  loading: boolean
  onToggle: (row: AdminReseller) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[980px]'>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>代理商</TableHead>
            <TableHead>联系人</TableHead>
            <TableHead className='text-right'>Key</TableHead>
            <TableHead className='text-right'>站点</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={8} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={8} Icon={BriefcaseBusinessIcon} title='还没有代理商' />
            ) : (
              rows.map((row, index) => {
                const inactive = row.is_active === false
                return (
                  <TableRow key={row.id ?? index}>
                    <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{row.name ?? '-'}</div>
                      <div className='text-xs text-muted-foreground'>
                        {row.username ?? '-'} / {row.email ?? '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{row.contact_name || '-'}</div>
                      <div className='text-xs text-muted-foreground'>{row.phone || '-'}</div>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{row.key_count ?? 0}</TableCell>
                    <TableCell className='text-right tabular-nums'>{row.site_count ?? 0}</TableCell>
                    <TableCell>
                      <StatusBadge tone={inactive ? 'neutral' : 'success'}>{inactive ? '停用' : '启用'}</StatusBadge>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                    <TableCell className='text-right'>
                      <Button size='sm' variant='outline' onClick={() => onToggle(row)}>
                        {inactive ? '启用' : '停用'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
