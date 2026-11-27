import { Readout } from '@/components/shared/Readout'
import type { AdminTask } from '@/lib/api/admin'
import { topErrors } from '@/pages/admin/tasks/taskFormat'

function percent(part: number, total: number) {
  return total > 0 ? ((part / total) * 100).toFixed(1) : '0'
}

/** What the tasks on this page add up to: how many, how many went through, how many failed and why. Counts are for the page, not the whole table. */
export function TaskSummary({ tasks }: { tasks: AdminTask[] }) {
  const total = tasks.length
  const done = tasks.filter((task) => task.status === 'done').length
  const failed = tasks.filter((task) => task.status === 'failed').length
  const errors = topErrors(tasks)

  return (
    <div className='glass grid grid-cols-2 gap-8 p-6 xl:grid-cols-4'>
      <Readout size='md' label='本页记录数' value={String(total)} loading={false} />
      <Readout size='md' label='成功' value={String(done)} note={`${percent(done, total)}%`} loading={false} />
      <Readout size='md' label='失败' value={String(failed)} note={`${percent(failed, total)}%`} loading={false} />
      <div className='flex min-w-0 flex-col gap-2'>
        <p className='text-xs text-muted-foreground'>高频失败原因</p>
        {errors.length > 0 ? (
          <ul className='flex flex-col gap-1'>
            {errors.map(([message, count]) => (
              <li key={message} className='flex items-start gap-2 text-xs'>
                <span className='shrink-0 font-medium tabular-nums'>×{count}</span>
                <span className='truncate text-muted-foreground' title={message}>
                  {message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>-</p>
        )}
      </div>
    </div>
  )
}
