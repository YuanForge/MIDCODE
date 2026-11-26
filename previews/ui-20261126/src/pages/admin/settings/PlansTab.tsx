import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SettingGroup, ToggleRow } from '@/pages/admin/settings/controls'
import { emptyPlan, planDiscountLabel, totalPlanCredits, type PlanRow } from '@/pages/admin/settings/settingsModel'

function PlanTable({ rows, onRows }: { rows: PlanRow[]; onRows: (next: PlanRow[]) => void }) {
  function patch<K extends keyof PlanRow>(index: number, key: K, value: PlanRow[K]) {
    onRows(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  return (
    <div className='overflow-x-auto rounded-xl border border-glass-border'>
      <Table className='min-w-[860px]'>
        <TableHeader>
          <TableRow>
            <TableHead>积分数</TableHead>
            <TableHead>赠送积分</TableHead>
            <TableHead className='text-right'>到账积分</TableHead>
            <TableHead>金额（元）</TableHead>
            <TableHead>原价（元）</TableHead>
            <TableHead className='text-right'>折扣</TableHead>
            <TableHead>描述</TableHead>
            <TableHead className='w-10'>
              <span className='sr-only'>操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const n = index + 1
            return (
              <TableRow key={index}>
                <TableCell>
                  <Input aria-label={`套餐 ${n} 积分数`} type='number' min={1} value={row.credits} onChange={(event) => patch(index, 'credits', Number(event.target.value))} className='h-8 w-28' />
                </TableCell>
                <TableCell>
                  <Input aria-label={`套餐 ${n} 赠送积分`} type='number' min={0} value={row.bonus} onChange={(event) => patch(index, 'bonus', Number(event.target.value))} className='h-8 w-24' />
                </TableCell>
                <TableCell className='text-right font-medium tabular-nums'>{totalPlanCredits(row).toLocaleString()}</TableCell>
                <TableCell>
                  <Input aria-label={`套餐 ${n} 金额`} type='number' min={0.01} step={0.01} value={row.amount} onChange={(event) => patch(index, 'amount', Number(event.target.value))} className='h-8 w-24' />
                </TableCell>
                <TableCell>
                  <Input aria-label={`套餐 ${n} 原价`} type='number' min={0} step={0.01} value={row.origin_amount} onChange={(event) => patch(index, 'origin_amount', Number(event.target.value))} className='h-8 w-24' />
                </TableCell>
                <TableCell className='text-right tabular-nums text-muted-foreground'>{planDiscountLabel(row)}</TableCell>
                <TableCell>
                  <Input aria-label={`套餐 ${n} 描述`} value={row.desc} onChange={(event) => patch(index, 'desc', event.target.value)} placeholder='购买可获得xx积分' className='h-8 min-w-48' />
                </TableCell>
                <TableCell>
                  <Button type='button' variant='ghost' size='icon-sm' className='text-destructive' aria-label={`删除套餐 ${n}`} onClick={() => onRows(rows.filter((_, i) => i !== index))}>
                    <Trash2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** One line per plan, as users will see them and in the order they will see them. */
function PlanPreview({ rows }: { rows: PlanRow[] }) {
  return (
    <SettingGroup title='用户端展示' description='用户端将按当前顺序展示套餐。'>
      <ol className='divide-y divide-glass-border'>
        {rows.map((row, index) => (
          <li key={index} className='flex flex-wrap items-baseline gap-x-5 gap-y-1 py-3 text-sm'>
            <span className='w-14 text-muted-foreground'>套餐 {index + 1}</span>
            <span className='font-medium tabular-nums'>￥{Number(row.amount || 0).toFixed(2)}</span>
            <span className='tabular-nums'>
              到账 {totalPlanCredits(row).toLocaleString()} 积分（基础 {Number(row.credits || 0).toLocaleString()}，赠送 {Number(row.bonus || 0).toLocaleString()}）
            </span>
            <span className='tabular-nums text-muted-foreground'>原价 {Number(row.origin_amount || 0) > 0 ? `￥${Number(row.origin_amount).toFixed(2)}` : '—'}</span>
            <span className='tabular-nums text-muted-foreground'>折扣 {planDiscountLabel(row)}</span>
            <span className='text-muted-foreground'>{row.desc || '未填写描述，前台将只展示金额与积分。'}</span>
          </li>
        ))}
      </ol>
    </SettingGroup>
  )
}

/** Recharge plans: whether users may type their own amount, the plan table, and a read-back of what users will see. */
export function PlansTab({
  allowCustom,
  onAllowCustom,
  rows,
  onRows,
}: {
  allowCustom: boolean
  onAllowCustom: (next: boolean) => void
  rows: PlanRow[]
  onRows: (next: PlanRow[]) => void
}) {
  return (
    <div className='flex flex-col gap-8'>
      <SettingGroup title='自定义金额'>
        <ToggleRow id='setting-recharge_allow_custom' label='允许自定义金额' hint='开启后用户可在套餐之外自由输入充值金额；关闭则只能选套餐' checked={allowCustom} onChange={onAllowCustom} />
      </SettingGroup>

      <SettingGroup title='套餐列表' description='套餐顺序即展示顺序；不设置套餐则只显示自定义金额输入框'>
        <div className='flex flex-col gap-3 pt-3'>
          {rows.length > 0 ? <PlanTable rows={rows} onRows={onRows} /> : <p className='text-sm text-muted-foreground'>还没有套餐。</p>}
          <Button type='button' variant='outline' size='sm' className='self-start' onClick={() => onRows([...rows, { ...emptyPlan }])}>
            <PlusIcon data-icon='inline-start' />
            添加套餐
          </Button>
        </div>
      </SettingGroup>

      {rows.length > 0 ? <PlanPreview rows={rows} /> : null}
    </div>
  )
}
