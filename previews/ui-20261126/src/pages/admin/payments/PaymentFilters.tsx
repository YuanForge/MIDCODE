import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHANNEL_OPTIONS, STATUS_OPTIONS, type PaymentFilterState } from '@/pages/admin/payments/format'

/** Status, email, channel and time range. Nothing is requested until the person presses search. */
export function PaymentFilters({
  value,
  onChange,
  onSearch,
  onReset,
}: {
  value: PaymentFilterState
  onChange: (patch: Partial<PaymentFilterState>) => void
  onSearch: () => void
  onReset: () => void
}) {
  return (
    <FilterBar
      filters={
        <>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='payment-status' className='text-xs text-muted-foreground'>
              状态
            </Label>
            <Select value={value.status || '_all'} onValueChange={(next) => onChange({ status: next === '_all' ? '' : next })}>
              <SelectTrigger id='payment-status' className='w-28'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='_all'>全部</SelectItem>
                {STATUS_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='payment-email' className='text-xs text-muted-foreground'>
              用户邮箱
            </Label>
            <Input
              id='payment-email'
              className='w-52'
              placeholder='搜索邮箱...'
              value={value.email}
              onChange={(event) => onChange({ email: event.target.value })}
              onKeyDown={(event) => event.key === 'Enter' && onSearch()}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='payment-channel' className='text-xs text-muted-foreground'>
              来源/渠道
            </Label>
            <Select value={value.channel || '_all'} onValueChange={(next) => onChange({ channel: next === '_all' ? '' : next })}>
              <SelectTrigger id='payment-channel' className='w-36'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='_all'>全部</SelectItem>
                {CHANNEL_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateRangeFilter label='时间' startAt={value.startAt} endAt={value.endAt} onChange={({ startAt, endAt }) => onChange({ startAt, endAt })} />
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
