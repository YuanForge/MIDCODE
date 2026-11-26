import { UsersIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminUser } from '@/lib/api/admin'
import { cn } from '@/lib/utils'
import { PAGE_SIZE, fmtBalance, fmtTime, isActive, yuan } from '@/pages/admin/users/userFormat'

/**
 * Users as a ruled ledger with a selection column. A frozen account carries a red edge and says so in words.
 * While an account is open beside the table (`compact`), the email, group and sign-up columns step aside: the panel
 * shows them for that account, and without them the table fits the narrower space without scrolling sideways.
 */
export function UsersTable({
  rows,
  loading,
  page,
  total,
  onPage,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onDetail,
  onFreeze,
  onUnfreeze,
  openId,
  compact = false,
}: {
  rows: AdminUser[]
  loading: boolean
  page: number
  total: number
  onPage: (next: number) => void
  selected: ReadonlySet<number>
  allSelected: boolean
  onToggle: (id: number) => void
  onToggleAll: () => void
  onDetail: (user: AdminUser) => void
  onFreeze: (user: AdminUser) => void
  onUnfreeze: (user: AdminUser) => void
  /** The account open beside the table. Its row is marked like a selected one. */
  openId?: number
  compact?: boolean
}) {
  const cols = compact ? 6 : 9
  return (
    <div className='glass overflow-hidden'>
      <Table className={compact ? undefined : 'min-w-[1100px]'}>
        <TableHeader>
          <TableRow>
            <TableHead className='w-10'>
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label='全选本页' />
            </TableHead>
            <TableHead className='w-20'>会员号</TableHead>
            <TableHead>姓名</TableHead>
            {compact ? null : <TableHead>邮箱</TableHead>}
            <TableHead className='w-24'>状态</TableHead>
            {compact ? null : <TableHead className='w-28'>分组</TableHead>}
            <TableHead className='w-32 text-right'>余额（¥）</TableHead>
            {compact ? null : <TableHead className='w-44'>注册时间</TableHead>}
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={cols} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={cols} Icon={UsersIcon} title='没有找到用户' description='调整筛选条件后重试。' />
            ) : (
              rows.map((row, index) => {
                const id = row.id
                const active = isActive(row)
                const isSelected = id != null && selected.has(id)
                const isOpen = id != null && id === openId
                return (
                  <TableRow
                    key={id ?? index}
                    data-row
                    data-state={isSelected || isOpen ? 'selected' : undefined}
                    aria-current={isOpen ? 'true' : undefined}
                    className={cn(!active && 'shadow-[inset_2px_0_0_var(--destructive)]')}
                  >
                    <TableCell>
                      <Checkbox aria-label={`选择用户 ${id ?? ''}`} checked={isSelected} onCheckedChange={() => id != null && onToggle(id)} />
                    </TableCell>
                    <TableCell className='tabular-nums text-muted-foreground'>{id ?? '-'}</TableCell>
                    {/* A long name is cut only here, where it would otherwise push the table wider than its space. */}
                    <TableCell className={cn('font-medium', compact && 'max-w-64 truncate')} title={compact ? row.username : undefined}>
                      {row.username ?? '-'}
                    </TableCell>
                    {compact ? null : <TableCell className='text-sm text-muted-foreground'>{row.email ?? '-'}</TableCell>}
                    <TableCell>
                      <StatusBadge tone={active ? 'success' : 'danger'}>{active ? '正常' : '冻结'}</StatusBadge>
                    </TableCell>
                    {compact ? null : (
                      <TableCell className='text-sm text-muted-foreground'>
                        <div>{row.group || '-'}</div>
                        {row.vip_recharge_baseline ? <div className='text-[11px] text-muted-foreground/70'>重新累计 {yuan(row.vip_recharge_baseline, 2)}</div> : null}
                      </TableCell>
                    )}
                    <TableCell className='text-right font-mono text-[13px]'>{fmtBalance(row)}</TableCell>
                    {compact ? null : <TableCell className='text-sm text-muted-foreground'>{fmtTime(row.created_at)}</TableCell>}
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-1.5'>
                        <Button size='sm' variant='outline' data-row-open onClick={() => onDetail(row)}>
                          详情
                        </Button>
                        {active ? (
                          <Button size='sm' variant='outline' className='text-destructive' onClick={() => onFreeze(row)}>
                            封禁
                          </Button>
                        ) : (
                          <Button size='sm' variant='outline' onClick={() => onUnfreeze(row)}>
                            解封
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        )}
      </Table>
      {total > 0 ? <TablePagination current={page} total={total} pageSize={PAGE_SIZE} onChange={onPage} className='rounded-none border-x-0 border-b-0' /> : null}
    </div>
  )
}
