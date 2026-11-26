import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Narrow the card list by status. Nothing is requested until the person presses search. */
export function CardFilters({
  status,
  onStatus,
  onSearch,
  onReset,
}: {
  status: string
  onStatus: (next: string) => void
  onSearch: () => void
  onReset: () => void
}) {
  return (
    <FilterBar
      filters={
        <div className='flex flex-col gap-1'>
          <Label htmlFor='card-status' className='text-xs text-muted-foreground'>
            状态过滤
          </Label>
          <Select value={status || '_all'} onValueChange={(next) => onStatus(next === '_all' ? '' : next)}>
            <SelectTrigger id='card-status' className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_all'>全部</SelectItem>
              <SelectItem value='unused'>未使用</SelectItem>
              <SelectItem value='used'>已使用</SelectItem>
              <SelectItem value='voided'>已作废</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
