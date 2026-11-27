import { RotateCcwIcon, SearchIcon } from 'lucide-react'

import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import type { ChannelFilterState } from '@/pages/admin/channels/filters'

type TextKey = 'q' | 'name' | 'display_name' | 'model_provider'

/** One row of compact controls: free text, name, display name, provider, a price range and a price order. Nothing is requested until the person presses search. */
export function ChannelFilters({
  value,
  onField,
  onSearch,
  onReset,
}: {
  value: ChannelFilterState
  onField: <K extends keyof ChannelFilterState>(key: K, next: ChannelFilterState[K]) => void
  onSearch: () => void
  onReset: () => void
}) {
  const enter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') onSearch()
  }
  const text = (key: TextKey, label: string, width: string, placeholder: string) => (
    <Input
      aria-label={label}
      className={`h-8 ${width}`}
      placeholder={placeholder}
      value={value[key]}
      onChange={(event) => onField(key, event.target.value)}
      onKeyDown={enter}
    />
  )

  return (
    <FilterBar
      className='lg:items-center'
      filters={
        <>
          {text('q', '全部', 'w-48', '搜索 名称 / 模型')}
          {text('name', '渠道名称', 'w-40', '渠道名称')}
          {text('display_name', '自定义名称', 'w-40', '展示名称')}
          {text('model_provider', '企业', 'w-48', '企业，如 OpenAI')}
          <div role='group' aria-label='价格范围（CNY）' className='flex items-center gap-1'>
            <Input aria-label='最低价格' className='h-8 w-32' inputMode='decimal' placeholder='最低价（CNY）' value={value.price_min} onChange={(event) => onField('price_min', event.target.value)} onKeyDown={enter} />
            <span className='text-muted-foreground'>-</span>
            <Input aria-label='最高价格' className='h-8 w-32' inputMode='decimal' placeholder='最高价（CNY）' value={value.price_max} onChange={(event) => onField('price_max', event.target.value)} onKeyDown={enter} />
          </div>
          <NativeSelect aria-label='价格排序' className='h-8 w-36' value={value.price_order} onChange={(event) => onField('price_order', event.target.value)}>
            <option value=''>价格排序：默认</option>
            <option value='asc'>价格：低到高</option>
            <option value='desc'>价格：高到低</option>
          </NativeSelect>
        </>
      }
      actions={
        <>
          <Button size='sm' onClick={onSearch}>
            <SearchIcon data-icon='inline-start' />
            搜索
          </Button>
          <Button size='sm' variant='outline' onClick={onReset}>
            <RotateCcwIcon data-icon='inline-start' />
            重置
          </Button>
        </>
      }
    />
  )
}
