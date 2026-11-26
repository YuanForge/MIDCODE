import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TYPE_OPTIONS, type BillingFilterState } from '@/pages/admin/billing/format'

/** Time range, type and ids. Nothing is requested until the person presses search. */
export function BillingFilters({
  value,
  onField,
  onSearch,
  onReset,
}: {
  value: BillingFilterState
  onField: <K extends keyof BillingFilterState>(key: K, next: BillingFilterState[K]) => void
  onSearch: () => void
  onReset: () => void
}) {
  const time = (key: 'startAt' | 'endAt', label: string) => (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={`billing-${key}`} className='text-xs text-muted-foreground'>
        {label}
      </Label>
      <Input id={`billing-${key}`} type='datetime-local' className='w-52' value={value[key]} onChange={(event) => onField(key, event.target.value)} />
    </div>
  )
  const id = (key: 'userId' | 'apiKeyId', label: string) => (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={`billing-${key}`} className='text-xs text-muted-foreground'>
        {label}
      </Label>
      <Input
        id={`billing-${key}`}
        className='w-28'
        placeholder='精确'
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
          {time('startAt', '开始时间')}
          {time('endAt', '结束时间')}
          <div className='flex flex-col gap-1'>
            <Label htmlFor='billing-type' className='text-xs text-muted-foreground'>
              类型
            </Label>
            <Select value={value.type || '_all'} onValueChange={(next) => onField('type', next === '_all' ? '' : next)}>
              <SelectTrigger id='billing-type' className='w-28'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='_all'>全部</SelectItem>
                {TYPE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {id('userId', '用户 ID')}
          {id('apiKeyId', 'API Key ID')}
        </>
      }
      actions={
        <>
          <Button onClick={onSearch}>查询</Button>
          <Button variant='outline' onClick={onReset}>
            重置
          </Button>
        </>
      }
    />
  )
}
