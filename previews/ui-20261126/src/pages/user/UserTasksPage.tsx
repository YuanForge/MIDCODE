import { useState } from 'react'

import { formatDateTimeFilterValue } from '@/components/shared/DateRangeFilter'
import { PageHeader } from '@/components/shared/PageHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { userApi, type UserTask } from '@/lib/api/user'
import { TaskDetailDialog } from '@/pages/user/tasks/TaskDetailDialog'
import { TaskFilters, type TaskFilterValues } from '@/pages/user/tasks/TaskFilters'
import { TaskTable } from '@/pages/user/tasks/TaskTable'
import { useTaskDetail } from '@/pages/user/tasks/useTaskDetail'

const PAGE_SIZE = 20
const EMPTY_FILTERS: TaskFilterValues = { task_id: '', type: '', status: '', startAt: '', endAt: '' }

/** Task center: filters, then the ledger of asynchronous tasks, then the page counter. The detail opens in a dialog. */
export function UserTasksPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<TaskFilterValues>(EMPTY_FILTERS)
  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({ page: 1, size: PAGE_SIZE })

  const { data, loading, error, reload } = useAsync(
    async () => {
      const res = await userApi.listTasks(queryParams)
      const tasks = Array.isArray(res) ? res : res.tasks ?? res.items ?? []
      const total = Array.isArray(res) ? tasks.length : (res as { total?: number }).total ?? tasks.length
      return { tasks, total }
    },
    { tasks: [] as UserTask[], total: 0 },
    [queryParams],
  )

  const task = useTaskDetail()

  function search() {
    const params: Record<string, unknown> = { page: 1, size: PAGE_SIZE }
    if (filters.task_id) params.task_id = filters.task_id
    if (filters.type) params.type = filters.type
    if (filters.status) params.status = filters.status
    if (filters.startAt) params.start_at = formatDateTimeFilterValue(filters.startAt)
    if (filters.endAt) params.end_at = formatDateTimeFilterValue(filters.endAt)
    setPage(1)
    setQueryParams(params)
  }

  function reset() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
    setQueryParams({ page: 1, size: PAGE_SIZE })
  }

  function changePage(next: number) {
    setPage(next)
    setQueryParams((current) => ({ ...current, page: next }))
  }

  return (
    <>
      <PageHeader
        title='任务中心'
        description='查看异步任务的状态、计费和结果详情。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <TaskFilters values={filters} onChange={setFilters} onSearch={search} onReset={reset} />
      <TaskTable rows={data.tasks} loading={loading} onOpen={(id) => void task.open(id)} />
      {data.total > 0 ? (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-[13px] text-muted-foreground tabular-nums'>共 {data.total} 条记录</p>
          <TablePagination
            current={page}
            total={data.total}
            pageSize={PAGE_SIZE}
            onChange={changePage}
            className='min-h-0 border-0 bg-transparent px-0 py-1'
          />
        </div>
      ) : null}

      <TaskDetailDialog task={task.detail} loading={task.loading} billing={task.billing} onClose={task.close} />
    </>
  )
}
