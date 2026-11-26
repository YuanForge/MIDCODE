import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_OPTIONS, TYPE_OPTIONS, type TaskFilterState } from '@/pages/admin/tasks/taskFormat'

type Option = { value: string; label: string }

function Pick({
  id,
  label,
  width,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  width: string
  allLabel: string
  value: string
  options: Option[]
  onChange: (next: string) => void
}) {
  return (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={id} className='text-xs text-muted-foreground'>
        {label}
      </Label>
      <Select value={value || '_all'} onValueChange={(next) => onChange(next === '_all' ? '' : next)}>
        <SelectTrigger id={id} className={width}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='_all'>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Task id, user, type, status and time range. Nothing is requested until the person presses search. */
export function TaskFilters({
  value,
  onField,
  onSearch,
  onReset,
}: {
  value: TaskFilterState
  onField: <K extends keyof TaskFilterState>(key: K, next: TaskFilterState[K]) => void
  onSearch: () => void
  onReset: () => void
}) {
  const text = (key: 'task_id' | 'user_id', label: string) => (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={`task-${key}`} className='text-xs text-muted-foreground'>
        {label}
      </Label>
      <Input
        id={`task-${key}`}
        className='w-28'
        placeholder={label}
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
          {text('task_id', 'Task ID')}
          {text('user_id', '用户 ID')}
          <Pick id='task-type' label='任务类型' width='w-32' allLabel='全部类型' value={value.type} options={TYPE_OPTIONS} onChange={(next) => onField('type', next)} />
          <Pick id='task-status' label='状态' width='w-32' allLabel='全部状态' value={value.status} options={STATUS_OPTIONS} onChange={(next) => onField('status', next)} />
          <DateRangeFilter
            label='时间范围'
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
          <Button onClick={onSearch}>查询</Button>
          <Button variant='outline' onClick={onReset}>
            重置
          </Button>
        </>
      }
    />
  )
}
