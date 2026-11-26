import { useMemo, useState } from 'react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { channelOptionLabel, type ModelOption } from '@/pages/admin/groups/groupForm'

type Selection = Record<string, string>

/** Which public models a group serves, and through which channel. A model is ticked, then bound to exactly one channel; a model with a single channel is bound as soon as it is ticked. */
export function BindingsEditor({
  options,
  selected,
  onSelected,
  providerChosen,
  providerInactive,
}: {
  options: ModelOption[]
  selected: Selection
  onSelected: (next: Selection) => void
  providerChosen: boolean
  providerInactive: boolean
}) {
  const [search, setSearch] = useState('')
  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return keyword ? options.filter((item) => item.model.toLowerCase().includes(keyword)) : options
  }, [options, search])

  function selectAll() {
    onSelected(Object.fromEntries(options.map((item) => [item.model, item.channels.length === 1 ? String(item.channels[0].id) : selected[item.model] ?? ''])))
  }

  function toggle(item: ModelOption, checked: boolean) {
    const next = { ...selected }
    if (checked) next[item.model] = item.channels.length === 1 ? String(item.channels[0].id) : ''
    else delete next[item.model]
    onSelected(next)
  }

  return (
    <div className='flex flex-col gap-3 border-t border-glass-border pt-4'>
      <p className='text-sm font-medium'>模型绑定</p>
      {!providerChosen ? <p className='text-sm text-muted-foreground'>请先选择模型企业，再选择该企业的模型渠道。</p> : null}
      {providerInactive ? <p className='text-sm text-muted-foreground'>当前企业已停用，仅可修改其他字段，不能调整模型绑定。</p> : null}
      <div className='flex flex-wrap items-center gap-2'>
        <Input aria-label='搜索模型' className='max-w-sm' value={search} onChange={(event) => setSearch(event.target.value)} placeholder='搜索模型' />
        <Button variant='outline' disabled={providerInactive} onClick={selectAll}>
          全选
        </Button>
        <Button variant='outline' disabled={providerInactive} onClick={() => onSelected({})}>
          清空
        </Button>
        <span className='text-sm tabular-nums text-muted-foreground'>
          已选 {Object.keys(selected).length} / {options.length}
        </span>
      </div>
      <div className='max-h-[420px] overflow-y-auto rounded-xl border border-glass-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>选择</TableHead>
              <TableHead>公开模型</TableHead>
              <TableHead>渠道</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableEmpty cols={3} title='没有匹配的模型' description={providerChosen ? '换个关键词再试。' : '选择模型企业后会列出它的模型。'} />
            ) : (
              visible.map((item) => {
                const isSelected = Object.prototype.hasOwnProperty.call(selected, item.model)
                return (
                  <TableRow key={item.model}>
                    <TableCell>
                      <Checkbox aria-label={`选择 ${item.model}`} disabled={providerInactive} checked={isSelected} onCheckedChange={(checked) => toggle(item, checked === true)} />
                    </TableCell>
                    <TableCell className='font-mono text-sm'>{item.model}</TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`${item.model} 的渠道`}
                        disabled={!isSelected || providerInactive}
                        value={selected[item.model] ?? ''}
                        onChange={(event) => onSelected({ ...selected, [item.model]: event.target.value })}
                      >
                        <option value=''>{item.channels.length > 1 ? '请选择一个渠道' : '选择渠道'}</option>
                        {item.channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channelOptionLabel(channel, item.model)}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
