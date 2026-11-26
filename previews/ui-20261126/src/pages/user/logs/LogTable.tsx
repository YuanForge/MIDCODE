import { ChevronRightIcon, FileClockIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { UserLog } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'
import { formatCallDuration } from '@/lib/formatters/duration'
import { cn } from '@/lib/utils'
import { Dash, LogStatus, TokenPrice } from '@/pages/user/logs/LogCells'

const COLS = 10
const COMPACT_COLS = 4

/**
 * Call ledger on one glass sheet: one solid row per request. A failed call gets a light red row and a red edge, in addition to its word and dot.
 * A click anywhere on a row opens its detail, and the 详情 button stays as the same action for the keyboard.
 * With the detail open beside it the table drops the token and price columns, which the detail shows, so it
 * never has to scroll sideways.
 * The open row is marked as selected.
 */
export function LogTable({
  rows,
  loading,
  selectedId,
  compact = false,
  onOpen,
}: {
  rows: UserLog[]
  loading: boolean
  /** The id of the row whose detail is open, if any. */
  selectedId?: number
  /** With the detail open beside it, the table keeps the four columns people scan by. The rest is in the detail. */
  compact?: boolean
  onOpen: (row: UserLog) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className={compact ? undefined : 'min-w-[1120px]'}>
        <TableHeader>
          <TableRow>
            <TableHead>模型</TableHead>
            <TableHead>请求时间</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden')}>耗时</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden')}>输入 Tokens</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden')}>输出 Tokens</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden')}>输入价格</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden')}>输出价格</TableHead>
            <TableHead className='text-right'>消耗积分</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden')}>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={compact ? COMPACT_COLS : COLS} rows={8} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty
                cols={compact ? COMPACT_COLS : COLS}
                Icon={FileClockIcon}
                title='还没有调用日志'
                description='使用 API 密钥发起 LLM 请求后，调用记录会展示在这里。'
              />
            ) : (
              rows.map((row, index) => {
                const usage = row.usage
                const charged = row.credits_charged ?? row.cost_credits
                return (
                  <TableRow
                    key={row.id ?? index}
                    data-state={selectedId != null && row.id === selectedId ? 'selected' : undefined}
                    className={cn('cursor-pointer', row.status === 'error' && 'bg-destructive/8 shadow-[inset_3px_0_0_var(--destructive)]')}
                    onClick={() => {
                      // A drag that selects text in the row is a copy, not an open.
                      if (!window.getSelection()?.toString()) onOpen(row)
                    }}
                  >
                    <TableCell className='max-w-[220px] truncate font-medium text-foreground' title={row.model}>
                      {row.model ?? '-'}
                    </TableCell>
                    <TableCell className='text-[13px] text-muted-foreground'>
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className={cn('text-right text-[13px] text-muted-foreground', compact && 'hidden')}>
                      {formatCallDuration(row.latency_ms) ?? <Dash />}
                    </TableCell>
                    <TableCell className={cn('text-right', compact && 'hidden')}>
                      {usage?.prompt_tokens != null ? (
                        <div className='font-mono text-[13px]'>
                          {usage.prompt_tokens.toLocaleString()}
                          {usage.cache_read_tokens ? (
                            <div className='mt-0.5 font-sans text-[11px] leading-tight text-muted-foreground'>
                              命中 {usage.cache_read_tokens.toLocaleString()}
                            </div>
                          ) : null}
                          {usage.cache_creation_tokens ? (
                            <div className='font-sans text-[11px] leading-tight text-muted-foreground'>
                              写入 {usage.cache_creation_tokens.toLocaleString()}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell className={cn('text-right', compact && 'hidden')}>
                      {usage?.completion_tokens != null ? (
                        <div className='flex flex-col items-end gap-1'>
                          <span className='font-mono text-[13px]'>{usage.completion_tokens.toLocaleString()}</span>
                          {usage.estimated ? (
                            <Badge variant='outline' className='h-4 px-1 py-0 text-[10px]'>
                              估算
                            </Badge>
                          ) : null}
                        </div>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell className={cn('text-right', compact && 'hidden')}>
                      <TokenPrice value={row.input_price_per_1m_tokens} />
                    </TableCell>
                    <TableCell className={cn('text-right', compact && 'hidden')}>
                      <TokenPrice value={row.output_price_per_1m_tokens} />
                    </TableCell>
                    <TableCell className='text-right'>
                      {charged ? (
                        <span className='font-mono text-[13px] font-medium text-foreground'>−{formatCredits(charged)}</span>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell>
                      <LogStatus status={row.status} />
                    </TableCell>
                    <TableCell className={cn('text-right', compact && 'hidden')}>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={(event) => {
                          // The row has the same action, so the click stops here instead of opening twice.
                          event.stopPropagation()
                          onOpen(row)
                        }}
                      >
                        详情
                        <ChevronRightIcon data-icon='inline-end' />
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
