import { KeyRoundIcon, Trash2Icon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminKeyPool } from '@/lib/api/admin'
import { boundCount } from '@/pages/admin/keypools/poolFormat'

/** Key pools as a ruled ledger. A pool is switched on or off, opened to vendor uploads or not, and holds keys managed in a dialog. */
export function PoolsTable({
  pools,
  loading,
  onKeys,
  onBind,
  onToggle,
  onToggleVendor,
  onDelete,
}: {
  pools: AdminKeyPool[]
  loading: boolean
  onKeys: (pool: AdminKeyPool) => void
  onBind: (pool: AdminKeyPool) => void
  onToggle: (pool: AdminKeyPool) => void
  onToggleVendor: (pool: AdminKeyPool) => void
  onDelete: (pool: AdminKeyPool) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1000px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-16'>ID</TableHead>
            <TableHead>名称</TableHead>
            <TableHead className='w-28 text-right'>绑定渠道</TableHead>
            <TableHead className='w-24'>状态</TableHead>
            <TableHead className='w-28'>号商上传</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : (
          <TableBody>
            {pools.length === 0 ? (
              <TableEmpty cols={6} Icon={KeyRoundIcon} title='暂无号池数据' description='新建号池后会显示在这里。' />
            ) : (
              pools.map((pool, index) => (
                <TableRow key={pool.id ?? index}>
                  <TableCell className='tabular-nums'>{pool.id ?? '-'}</TableCell>
                  <TableCell className='font-medium'>{pool.name ?? '-'}</TableCell>
                  <TableCell className='text-right tabular-nums'>{boundCount(pool)} 个</TableCell>
                  <TableCell>
                    <StatusBadge tone={pool.is_active ? 'success' : 'neutral'}>{pool.is_active ? '启用' : '停用'}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={pool.vendor_submittable ? 'info' : 'neutral'}>{pool.vendor_submittable ? '开放' : '关闭'}</StatusBadge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex flex-wrap justify-end gap-2'>
                      <Button size='sm' variant='outline' onClick={() => onKeys(pool)}>
                        管理 Keys
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => onBind(pool)}>
                        绑定渠道
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => onToggle(pool)}>
                        {pool.is_active ? '停用' : '启用'}
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => onToggleVendor(pool)}>
                        {pool.vendor_submittable ? '关闭号商上传' : '开放号商上传'}
                      </Button>
                      <Button size='sm' variant='outline' className='text-destructive' onClick={() => onDelete(pool)}>
                        <Trash2Icon data-icon='inline-start' />
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
