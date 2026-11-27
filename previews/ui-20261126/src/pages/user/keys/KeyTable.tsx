import { CCSwitchImport } from '../CCSwitchImport'
import { KeyRoundIcon, PencilIcon, Trash2Icon } from 'lucide-react'

import { CopyButton } from '@/components/shared/CopyButton'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ApiKeyRecord } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'
import { cn } from '@/lib/utils'

const COLS = 7

// Spend is neutral ink: a normal charge is not an error, so it is never red.
function Spend({ value, strong }: { value?: number; strong?: boolean }) {
  const amount = value ?? 0
  return (
    <span className={cn('text-[13px]', amount > 0 ? 'text-foreground' : 'text-muted-foreground/70', amount > 0 && strong && 'font-medium')}>
      <span className='font-mono'>{formatCredits(amount)}</span>
      <span className='ml-1 text-xs text-muted-foreground'>积分</span>
    </span>
  )
}

/** The full key when the server can still show it, otherwise nothing: only a key that can be read can be copied. */
function readableKey(item: ApiKeyRecord) {
  return item.viewable ? (item.raw_key ?? item.key ?? '') : ''
}

/**
 * The key as a row shows it. Every key starts with the same prefix, so the whole text tells keys apart no better
 * than its head after the prefix and its last four characters do. The copy button next to it carries the whole key.
 */
function shortKey(item: ApiKeyRecord) {
  const raw = readableKey(item)
  if (raw) return raw.length > 20 ? `${raw.slice(0, 10)}…${raw.slice(-4)}` : raw
  if (item.key_prefix) return `${item.key_prefix}…`
  return item.masked_key ?? '***'
}

/** When the key was last used, for telling keys apart. Nothing at all when the server did not send the field. */
function lastUsed(value: string | null | undefined) {
  if (value === undefined) return ''
  if (value === null) return '从未使用'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (date.getUTCFullYear() <= 1) return '从未使用'
  return `最近使用 ${date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`
}

function byPriority(item: ApiKeyRecord) {
  return (item.model_groups ?? []).slice().sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
}

/**
 * Key ledger: one ruled row per key. The name is cut to one line with the last use under it, and the key is cut to
 * its head and tail with a copy button beside it, so a long name or key can never push the rest of the row out of
 * view. The numbers on the group chips are the real call order, so they stay, and the edit button sits with them.
 */
export function KeyTable({
  keys,
  loading,
  onBind,
  onDelete,
}: {
  keys: ApiKeyRecord[]
  loading: boolean
  onBind: (item: ApiKeyRecord) => void
  onDelete: (id: number | undefined) => void
}) {
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <h2 className='text-[15px] font-semibold text-foreground'>
          全部密钥
          {!loading ? <span className='ml-2 font-normal text-muted-foreground tabular-nums'>{keys.length}</span> : null}
        </h2>
        <p className='text-[13px] text-muted-foreground'>消耗按积分统计，第一组分组优先调用，其余分组用于失败回退</p>
      </div>
      <div className='glass overflow-hidden'>
        <Table className='min-w-[880px]'>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>模型分组（按调用顺序）</TableHead>
              <TableHead className='text-right'>今日消耗</TableHead>
              <TableHead className='text-right'>累计消耗</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={COLS} rows={3} />
          ) : (
            <TableBody>
              {keys.length === 0 ? (
                <TableEmpty
                  cols={COLS}
                  Icon={KeyRoundIcon}
                  title='还没有 API 密钥'
                  description='点击右上角「新建密钥」即可创建，生成后的完整密钥只会展示一次。'
                />
              ) : (
                keys.map((item, index) => {
                  const rawKey = readableKey(item)
                  const name = item.name || '未命名'
                  const used = lastUsed(item.last_used_at)
                  return (
                    <TableRow key={item.id ?? index}>
                      <TableCell>
                        <div className='flex w-48 flex-col gap-0.5'>
                          <span className='truncate font-medium text-foreground' title={name}>
                            {name}
                          </span>
                          {used ? <span className='text-xs text-muted-foreground'>{used}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-1'>
                          <code className='font-mono text-xs text-muted-foreground'>{shortKey(item)}</code>
                          {rawKey ? (
                            <CopyButton value={rawKey} label={`复制密钥 ${name}`} successMessage={`已复制「${name}」的密钥`} />
                          ) : (
                            <span className='text-xs text-faint' title='旧版密钥创建时没有保存明文，无法再复制'>
                              无法复制
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex max-w-80 flex-wrap items-center gap-1.5'>
                          {byPriority(item).map((binding, order) => (
                            <Badge key={binding.group_id} variant='outline' className='h-6 gap-1.5 rounded-md pl-1 font-normal'>
                              <span className='flex size-4 items-center justify-center rounded-[4px] bg-glass-strong text-[10px] font-semibold text-muted-foreground tabular-nums'>
                                {order + 1}
                              </span>
                              {binding.group?.model_provider ? (
                                <span className='text-muted-foreground'>{binding.group.model_provider} ·</span>
                              ) : null}
                              {binding.group?.name || binding.group?.code || binding.group_id}
                            </Badge>
                          ))}
                          {item.needs_group_binding ? <StatusBadge tone='danger'>需要配置分组</StatusBadge> : null}
                          <Button variant='ghost' size='sm' className='text-muted-foreground hover:text-foreground' onClick={() => onBind(item)}>
                            <PencilIcon data-icon='inline-start' />
                            修改分组
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className='text-right'>
                        <Spend value={item.today_consumed} />
                      </TableCell>
                      <TableCell className='text-right'>
                        <Spend value={item.total_consumed} strong />
                      </TableCell>
                      <TableCell>
                        {item.is_active === false ? (
                          <StatusBadge tone='neutral'>停用</StatusBadge>
                        ) : (
                          <StatusBadge tone='success'>启用</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <CCSwitchImport selectedId={String(item.id)} keys={[{ id: String(item.id), name: item.name || '未命名密钥', key: item.viewable ? (item.raw_key ?? item.key ?? '') : '', unavailable: !item.viewable || item.is_active === false || item.needs_group_binding === true || !(item.raw_key || item.key) }]} />
                        <Button
                          variant='ghost'
                          size='sm'
                          className='text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                          onClick={() => onDelete(item.id)}
                        >
                          <Trash2Icon data-icon='inline-start' />
                          删除
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
    </div>
  )
}
