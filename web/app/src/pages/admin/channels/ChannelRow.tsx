import { CopyIcon, MoreHorizontalIcon, PowerIcon, RefreshCwIcon, ScrollTextIcon, Trash2Icon } from 'lucide-react'

import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TableCell, TableRow } from '@/components/ui/table'
import type { AdminChannel } from '@/lib/api/admin'
import { ChannelHealthBadge } from '@/pages/admin/channels/ChannelHealthBadge'
import { costSummary, isAutoSync, priceSummary, upstreamSummary } from '@/pages/admin/channels/channelFormat'

/** What a row can do. The page decides how each one is carried out. */
export type RowActions = {
  stats: (row: AdminChannel) => void
  edit: (row: AdminChannel) => void
  copy: (row: AdminChannel) => void
  log: (row: AdminChannel) => void
  refresh: (row: AdminChannel) => void
  toggle: (row: AdminChannel) => void
  remove: (row: AdminChannel) => void
}

/** One channel as one dense row. Token stats and edit stay in view and the rest sit under the more menu. j and k move between rows and Enter presses edit. */
export function ChannelRow({
  row,
  selected,
  onToggle,
  actions,
}: {
  row: AdminChannel
  selected: boolean
  onToggle: (id: number) => void
  actions: RowActions
}) {
  const id = row.id
  const active = row.is_active !== false
  const auto = isAutoSync(row)

  return (
    <TableRow data-row data-state={selected ? 'selected' : undefined}>
      <TableCell className='align-top'>
        <Checkbox aria-label={`选择渠道 ${id ?? ''}`} checked={selected} onCheckedChange={() => id != null && onToggle(id)} />
      </TableCell>
      <TableCell className='align-top font-mono text-xs tabular-nums text-muted-foreground'>{id ?? '-'}</TableCell>
      <TableCell className='max-w-64 align-top'>
        <div className='font-medium'>{row.name ?? '未命名渠道'}</div>
        <div className='break-all font-mono text-xs text-muted-foreground'>{row.model ?? row.routing_model ?? '-'}</div>
        {row.description ? <div className='line-clamp-1 text-xs text-muted-foreground'>{row.description}</div> : null}
      </TableCell>
      <TableCell className='align-top text-sm'>
        <div>{row.model_provider || '—'}</div>
        <div className='font-mono text-xs text-muted-foreground'>
          {row.type ?? '-'} / {row.protocol ?? 'openai'}
        </div>
      </TableCell>
      <TableCell className='max-w-72 align-top'>
        <dl className='grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-xs'>
          <dt className='text-muted-foreground'>售价</dt>
          <dd>{priceSummary(row)}</dd>
          <dt className='text-muted-foreground'>进价</dt>
          <dd className='text-muted-foreground'>{costSummary(row)}</dd>
        </dl>
      </TableCell>
      <TableCell className='max-w-56 align-top text-xs'>
        <div className='flex flex-col gap-1'>
          <div>
            <StatusBadge tone={auto ? 'success' : 'neutral'}>{auto ? '自动同步中' : '未开启'}</StatusBadge>
          </div>
          <span className='text-muted-foreground' title={auto ? '每 10 秒检测成本变化' : undefined}>{upstreamSummary(row)}</span>
                  </div>
      </TableCell>
      <TableCell className='align-top text-sm'>
        <div>{row.key_pool_id ? `号池 #${row.key_pool_id}` : '未绑定号池'}</div>
        <div className='font-mono text-xs tabular-nums text-muted-foreground'>
          P{row.priority ?? 0} / W{row.weight ?? 1}
        </div>
      </TableCell>
      <TableCell className='align-top'>{id ? <ChannelHealthBadge channelId={id} /> : <StatusBadge tone='neutral'>N/A</StatusBadge>}</TableCell>
      <TableCell className='align-top'>
        <StatusBadge tone={active ? 'success' : 'neutral'}>{active ? '启用' : '停用'}</StatusBadge>
      </TableCell>
      <TableCell className='align-top'>
        <div className='flex items-center justify-end gap-1.5'>
          {id != null ? (
            <Button size='sm' variant='outline' onClick={() => actions.stats(row)}>
              Token 统计
            </Button>
          ) : null}
          <Button size='sm' variant='outline' data-row-open onClick={() => actions.edit(row)}>
            编辑
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='icon-sm' variant='outline' aria-label='更多操作'>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-36'>
              <DropdownMenuItem onClick={() => actions.copy(row)}>
                <CopyIcon data-icon='inline-start' />
                复制
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.log(row)}>
                <ScrollTextIcon data-icon='inline-start' />
                日志
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.refresh(row)}>
                <RefreshCwIcon data-icon='inline-start' />
                刷新
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.toggle(row)}>
                <PowerIcon data-icon='inline-start' />
                {active ? '停用' : '启用'}
              </DropdownMenuItem>
              <DropdownMenuItem className='text-destructive focus:text-destructive' onClick={() => actions.remove(row)}>
                <Trash2Icon data-icon='inline-start' />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}
