import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminMe, type AdminTask } from '@/lib/api/admin'
import { CleanupPanel } from '@/pages/admin/tasks/CleanupPanel'
import { TaskDetailDialog } from '@/pages/admin/tasks/TaskDetailDialog'
import { TaskFilters } from '@/pages/admin/tasks/TaskFilters'
import { TaskSummary } from '@/pages/admin/tasks/TaskSummary'
import { TasksTable } from '@/pages/admin/tasks/TasksTable'
import { PAGE_SIZE, buildTaskParams, emptyFilters, type TaskFilterState } from '@/pages/admin/tasks/taskFormat'

/** Async tasks for debugging an integration: find one, read what it sent and got back. The irreversible clean-up sits last, and only for admins who may use it. */
export function AdminTasksPage() {
  const [filters, setFilters] = useState<TaskFilterState>(emptyFilters)
  const [page, setPage] = useState(1)
  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({ page: 1, size: PAGE_SIZE })

  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listTasks(queryParams)
    const tasks = Array.isArray(res) ? res : (res.tasks ?? res.items ?? [])
    const total = Array.isArray(res) ? tasks.length : (res as { total?: number }).total ?? tasks.length
    return { tasks, total }
  }, { tasks: [] as AdminTask[], total: 0 }, [queryParams])

  const { data: me } = useAsync<AdminMe | null>(() => adminApi.getAdminMe(), null, [])
  const permissions = me?.permissions ?? []
  const canCleanup = permissions.includes('*') || permissions.includes('tasks:write')

  const [detailId, setDetailId] = useState<number | null>(null)

  function updateField<K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function search() {
    setPage(1)
    setQueryParams(buildTaskParams(filters, 1))
  }

  function reset() {
    setFilters(emptyFilters)
    setPage(1)
    setQueryParams({ page: 1, size: PAGE_SIZE })
  }

  function changePage(next: number) {
    setPage(next)
    setQueryParams((prev) => ({ ...prev, page: next }))
  }

  return (
    <>
      <PageHeader
        title='异步任务排障'
        description='查看用户任务状态与完整请求/响应信息，辅助对接排障。'
        actions={
          error ? (
            <Button variant='outline' onClick={reload}>
              重试
            </Button>
          ) : null
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <TaskFilters value={filters} onField={updateField} onSearch={search} onReset={reset} />
      {!loading && data.tasks.length > 0 ? <TaskSummary tasks={data.tasks} /> : null}
      <TasksTable rows={data.tasks} loading={loading} page={page} total={data.total} onPage={changePage} onDetail={setDetailId} />
      {canCleanup ? <CleanupPanel onCleaned={reload} /> : null}

      {detailId != null ? <TaskDetailDialog key={detailId} id={detailId} onClose={() => setDetailId(null)} /> : null}
    </>
  )
}
