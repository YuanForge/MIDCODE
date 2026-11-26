import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type TaskFilterValues = {
  task_id: string
  type: string
  status: string
  startAt: string
  endAt: string
}

const ALL = '_all'

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={htmlFor} className='text-xs font-normal text-muted-foreground'>
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Filter row for the task ledger, on one glass sheet above the table. */
export function TaskFilters({
  values,
  onChange,
  onSearch,
  onReset,
}: {
  values: TaskFilterValues
  onChange: (next: TaskFilterValues) => void
  onSearch: () => void
  onReset: () => void
}) {
  return (
    <FilterBar
      filters={
        <>
          <Field label='任务 ID' htmlFor='task-filter-id'>
            <Input
              id='task-filter-id'
              className='w-28'
              placeholder='任务 ID'
              value={values.task_id}
              onChange={(event) => onChange({ ...values, task_id: event.target.value })}
              onKeyDown={(event) => event.key === 'Enter' && onSearch()}
            />
          </Field>
          <Field label='类型' htmlFor='task-filter-type'>
            <Select value={values.type || ALL} onValueChange={(next) => onChange({ ...values, type: next === ALL ? '' : next })}>
              <SelectTrigger id='task-filter-type' className='w-32'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部类型</SelectItem>
                <SelectItem value='image'>图片生成</SelectItem>
                <SelectItem value='video'>视频生成</SelectItem>
                <SelectItem value='audio'>音频生成</SelectItem>
                <SelectItem value='music'>音乐生成</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label='状态' htmlFor='task-filter-status'>
            <Select value={values.status || ALL} onValueChange={(next) => onChange({ ...values, status: next === ALL ? '' : next })}>
              <SelectTrigger id='task-filter-status' className='w-28'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部状态</SelectItem>
                <SelectItem value='pending'>排队中</SelectItem>
                <SelectItem value='processing'>处理中</SelectItem>
                <SelectItem value='done'>已完成</SelectItem>
                <SelectItem value='failed'>失败</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <DateRangeFilter
            startAt={values.startAt}
            endAt={values.endAt}
            label='时间范围'
            onChange={({ startAt, endAt }) => onChange({ ...values, startAt, endAt })}
          />
        </>
      }
      actions={
        <>
          <Button onClick={onSearch}>查询</Button>
          <Button variant='ghost' onClick={onReset}>
            重置
          </Button>
        </>
      }
    />
  )
}
