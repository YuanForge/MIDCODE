import { SearchIcon } from 'lucide-react'

import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { STATUS_OPTIONS, type LogFilterState } from '@/pages/admin/logs/logFormat'

type TextKey = 'model' | 'user_id' | 'channel_id' | 'api_key_id' | 'corr_id'

/** Model, ids, status and time range. Nothing is requested until the person presses search. */
export function LogFilters({
  value,
  onField,
  onSearch,
  onReset,
}: {
  value: LogFilterState
  onField: <K extends keyof LogFilterState>(key: K, next: LogFilterState[K]) => void
  onSearch: () => void
  onReset: () => void
}) {
  const text = (key: TextKey, label: string, width: string) => (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={`log-${key}`} className='text-xs text-muted-foreground'>
        {label}
      </Label>
      <Input
        id={`log-${key}`}
        className={cn(width, key === 'corr_id' && 'font-mono text-xs')}
        value={value[key]}
        onChange={(event) => onField(key, event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && onSearch()}
      />
    </div>
  )

  return (
    <FilterBar
      filters={
        <>
          {text('model', '模型', 'w-[160px]')}
          {text('user_id', '用户 ID', 'w-[100px]')}
          {text('channel_id', '渠道 ID', 'w-[100px]')}
          {text('api_key_id', 'API Key ID', 'w-[110px]')}
          {text('corr_id', 'Corr ID', 'w-[220px]')}
          <div className='flex flex-col gap-1'>
            <Label htmlFor='log-status' className='text-xs text-muted-foreground'>
              状态
            </Label>
            <NativeSelect id='log-status' className='w-[150px]' value={value.status} onChange={(event) => onField('status', event.target.value)}>
              <option value=''>全部状态</option>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DateRangeFilter
            label='时间'
            startAt={value.startAt}
            endAt={value.endAt}
            onChange={({ startAt, endAt }) => {
              onField('startAt', startAt)
              onField('endAt', endAt)
            }}
          />
        </>
      }
      actions={
        <>
          <Button onClick={onSearch}>
            <SearchIcon data-icon='inline-start' />
            查询
          </Button>
          <Button variant='outline' onClick={onReset}>
            重置
          </Button>
        </>
      }
    />
  )
}
