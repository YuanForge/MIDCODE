import { KeyRoundIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminPoolKey } from '@/lib/api/admin'
import { formatTime } from '@/pages/admin/keypools/poolFormat'

/** The keys of one pool. Priority, Base URL and on/off are edited in the row and only take effect when that row is saved. */
export function PoolKeysTable({
  rows,
  loading,
  isDirty,
  onDraft,
  onSave,
  onRemove,
  onUnbind,
}: {
  rows: AdminPoolKey[]
  loading: boolean
  isDirty: (id?: number) => boolean
  onDraft: (id: number | undefined, patch: Partial<AdminPoolKey>) => void
  onSave: (row: AdminPoolKey) => void
  onRemove: (row: AdminPoolKey) => void
  onUnbind: (row: AdminPoolKey) => void
}) {
  return (
    <div className='glass overflow-x-auto'>
      <Table className='min-w-[1280px]'>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Base URL</TableHead>
            <TableHead>号商</TableHead>
            <TableHead>最近使用</TableHead>
            <TableHead className='text-right'>调用次数</TableHead>
            <TableHead className='text-right'>失败率</TableHead>
            <TableHead>优先级</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={10} rows={3} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty cols={10} Icon={KeyRoundIcon} title='暂无 Key 数据' description='添加或批量导入后会显示在这里。' />
            ) : (
              rows.map((row, index) => {
                const id = row.id
                const dirty = isDirty(id)
                return (
                  <TableRow key={id ?? index}>
                    <TableCell className='tabular-nums'>{id ?? '-'}</TableCell>
                    <TableCell className='font-mono text-xs'>{row.value ?? '-'}</TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Key ${id ?? ''} 的 Base URL`}
                        className='min-w-[280px] font-mono text-xs'
                        value={row.base_url_override ?? ''}
                        onChange={(event) => onDraft(id, { base_url_override: event.target.value })}
                        placeholder='使用渠道 Base URL'
                      />
                    </TableCell>
                    <TableCell className='text-sm'>
                      {row.vendor_id != null ? (
                        <span className='flex items-center gap-1'>
                          <span>号商 #{row.vendor_id}</span>
                          <Button size='sm' variant='ghost' className='h-5 px-2 text-xs text-muted-foreground' onClick={() => onUnbind(row)}>
                            解绑
                          </Button>
                        </span>
                      ) : (
                        <span className='text-muted-foreground'>直营</span>
                      )}
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground'>{row.last_used_at ? formatTime(row.last_used_at) : '从未'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{row.total_calls ?? 0}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {row.fail_rate != null ? (
                        <span className={row.fail_rate > 0.1 ? 'text-destructive' : undefined}>{(row.fail_rate * 100).toFixed(1)}%</span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Key ${id ?? ''} 的优先级`}
                        type='number'
                        className='w-24'
                        value={String(row.priority ?? 0)}
                        onChange={(event) => onDraft(id, { priority: Number(event.target.value || '0') })}
                      />
                    </TableCell>
                    <TableCell>
                      <label className='flex items-center gap-2 text-sm'>
                        <input
                          type='checkbox'
                          className='size-4 accent-primary'
                          checked={row.is_active !== false}
                          onChange={(event) => onDraft(id, { is_active: event.target.checked })}
                        />
                        {row.is_active === false ? '停用' : '启用'}
                      </label>
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-2'>
                        {dirty ? <span className='text-xs text-muted-foreground'>未保存</span> : null}
                        <Button size='sm' variant='outline' disabled={!dirty} onClick={() => onSave(row)}>
                          保存
                        </Button>
                        <Button size='sm' variant='outline' className='text-destructive' onClick={() => onRemove(row)}>
                          删除
                        </Button>
                      </div>
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
