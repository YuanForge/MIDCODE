import { ServerIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminChannel } from '@/lib/api/admin'
import { ChannelRow, type RowActions } from '@/pages/admin/channels/ChannelRow'
import { CHANNEL_PAGE_SIZE } from '@/pages/admin/channels/filters'

export type { RowActions }

/** Channels as dense rows with a selection column. Row actions are handed in, so the table holds no state. */
export function ChannelsTable({
  rows,
  loading,
  page,
  total,
  onPage,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  actions,
}: {
  rows: AdminChannel[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
  selected: ReadonlySet<number>
  allSelected: boolean
  onToggle: (id: number) => void
  onToggleAll: () => void
  actions: RowActions
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1100px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-10'>
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label='全选本页' />
            </TableHead>
            <TableHead className='w-14'>ID</TableHead>
            <TableHead>渠道 / 模型</TableHead>
            <TableHead>企业 / 接口</TableHead>
            <TableHead title='VIP 折扣按用户等级自动计算'>价格</TableHead>
            <TableHead>成本同步</TableHead>
            <TableHead>号池 / 调度</TableHead>
            <TableHead className='w-28'>健康</TableHead>
            <TableHead className='w-20'>状态</TableHead>
            <TableHead className='w-52 text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={10} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={10} Icon={ServerIcon} title='暂无渠道数据' description='调整筛选条件或新增渠道。' />
            ) : (
              rows.map((row, index) => (
                <ChannelRow key={row.id ?? index} row={row} selected={row.id != null && selected.has(row.id)} onToggle={onToggle} actions={actions} />
              ))
            )}
          </TableBody>
        )}
      </Table>
      {total > 0 ? <TablePagination current={page} total={total} pageSize={CHANNEL_PAGE_SIZE} onChange={onPage} className='rounded-none border-x-0 border-b-0' /> : null}
    </div>
  )
}
