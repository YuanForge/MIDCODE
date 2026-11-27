import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminLog } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { LogDetailSheet } from '@/pages/admin/logs/LogDetailSheet'
import { LogFilters } from '@/pages/admin/logs/LogFilters'
import { LogsTable } from '@/pages/admin/logs/LogsTable'
import { PAGE_SIZE, buildLogParams, emptyFilters, type LogFilterState } from '@/pages/admin/logs/logFormat'

/** Every API call the platform handled. Filters apply when the person searches; paging keeps the filters that were applied. */
export function AdminLogsPage() {
  const [filters, setFilters] = useState<LogFilterState>(emptyFilters)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState<Record<string, unknown>>({ page: 1, page_size: PAGE_SIZE })

  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listLogs(query)
    return {
      logs: (Array.isArray(res) ? res : res.logs ?? res.items ?? []) as AdminLog[],
      total: (!Array.isArray(res) ? (res.total ?? 0) : 0) as number,
    }
  }, { logs: [] as AdminLog[], total: 0 }, [query])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [currentLog, setCurrentLog] = useState<AdminLog | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  function updateField<K extends keyof LogFilterState>(key: K, value: LogFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function search() {
    setPage(1)
    setQuery(buildLogParams(filters, 1))
  }

  function reset() {
    setFilters(emptyFilters)
    setPage(1)
    setQuery({ page: 1, page_size: PAGE_SIZE })
  }

  function changePage(next: number) {
    setPage(next)
    setQuery((prev) => ({ ...prev, page: next }))
  }

  async function openDetail(basic: AdminLog) {
    setDrawerOpen(true)
    setDetailLoading(true)
    setDetailError('')
    setCurrentLog({ ...basic })
    try {
      const res = await adminApi.getLog(basic.id!)
      setCurrentLog({ ...res, credits_charged: basic.credits_charged, cost_charged: basic.cost_charged })
    } catch (err) {
      setDetailError(getApiErrorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        title='调用日志'
        description='查看平台所有 API 调用日志记录。'
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

      <LogFilters value={filters} onField={updateField} onSearch={search} onReset={reset} />
      <LogsTable rows={data.logs} loading={loading} page={page} total={data.total} onPage={changePage} onDetail={(row) => void openDetail(row)} />
      <LogDetailSheet open={drawerOpen} onOpenChange={setDrawerOpen} log={currentLog} loading={detailLoading} error={detailError} />
    </>
  )
}
