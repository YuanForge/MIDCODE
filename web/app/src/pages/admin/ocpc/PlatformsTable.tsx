import { MegaphoneIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminOcpcPlatform } from '@/lib/api/admin'
import { keyConfig, platformLabel } from '@/pages/admin/ocpc/platformForm'

/** Promotion accounts as a ruled ledger: edit, switch on or off, delete after one confirmation. */
export function PlatformsTable({
  platforms,
  loading,
  onEdit,
  onToggle,
  onDelete,
}: {
  platforms: AdminOcpcPlatform[]
  loading: boolean
  onEdit: (row: AdminOcpcPlatform) => void
  onToggle: (row: AdminOcpcPlatform) => void
  onDelete: (row: AdminOcpcPlatform) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[860px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-16'>ID</TableHead>
            <TableHead className='w-24'>平台</TableHead>
            <TableHead>名称</TableHead>
            <TableHead>关键配置</TableHead>
            <TableHead className='w-24'>状态</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : (
          <TableBody>
            {platforms.length === 0 ? (
              <TableEmpty cols={6} Icon={MegaphoneIcon} title='暂无推广账户' description='点击右上角「新增账户」添加第一个平台账户。' />
            ) : (
              platforms.map((row, index) => (
                <TableRow key={row.id ?? index}>
                  <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                  <TableCell>{platformLabel(row.platform)}</TableCell>
                  <TableCell className='font-medium'>{row.name ?? '-'}</TableCell>
                  <TableCell className='max-w-[320px] truncate font-mono text-xs text-muted-foreground' title={keyConfig(row)}>
                    {keyConfig(row)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? '启用' : '停用'}</StatusBadge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-2'>
                      <Button size='sm' variant='outline' onClick={() => onEdit(row)}>
                        编辑
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => onToggle(row)}>
                        {row.enabled ? '停用' : '启用'}
                      </Button>
                      <Button size='sm' variant='outline' className='text-destructive' onClick={() => onDelete(row)}>
                        删除
                      </Button>
                    </div>
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
