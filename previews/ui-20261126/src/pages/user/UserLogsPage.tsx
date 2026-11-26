import { useCallback, useEffect, useRef, useState } from 'react'

import { formatDateTimeFilterValue } from '@/components/shared/DateRangeFilter'
import { PageHeader } from '@/components/shared/PageHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getApiErrorMessage } from '@/lib/api/http'
import { userApi, type ApiKeyRecord, type UserLog } from '@/lib/api/user'
import { LogDetail, LogDetailSheet } from '@/pages/user/logs/LogDetailSheet'
import { LogFilters, type LogFilterValues } from '@/pages/user/logs/LogFilters'
import { LogTable } from '@/pages/user/logs/LogTable'

const PAGE_SIZE = 20
const EMPTY_FILTERS: LogFilterValues = { model: '', status: '', apiKeyId: '', startAt: '', endAt: '' }

/** A field uses Escape itself, to clear a date or to close its own list, so the key is left to it. */
function isField(target: EventTarget | null) {
  return target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

/**
 * Call logs: filters, then the ledger of requests, then the page counter. On a window of 1280px or more the
 * detail opens in a panel beside the table, so rows can be gone through one after another. Below that it
 * opens in a drawer.
 */
export function UserLogsPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<LogFilterValues>(EMPTY_FILTERS)
  const [queryParams, setQueryParams] = useState<Record<string, string | number>>({ page: 1, page_size: PAGE_SIZE })

  const { data, loading, error, reload } = useAsync(
    async () => {
      const res = await userApi.listLogs(queryParams)
      return {
        logs: (Array.isArray(res) ? res : res.items ?? res.logs ?? []) as UserLog[],
        total: (res && !Array.isArray(res) ? res.total : 0) as number,
      }
    },
    { logs: [] as UserLog[], total: 0 },
    [queryParams],
  )

  const { data: apiKeys } = useAsync(async () => {
    const response = await userApi.listApiKeys()
    return (Array.isArray(response) ? response : response.api_keys ?? response.keys ?? []) as ApiKeyRecord[]
  }, [] as ApiKeyRecord[])

  const wide = useMediaQuery('(min-width: 1280px)')
  const [detailOpen, setDetailOpen] = useState(false)
  const [currentLog, setCurrentLog] = useState<UserLog | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  // Rows can be opened faster than their records come back. Each request takes a number, and only the one
  // holding the latest number may write state, so a slow answer never replaces the row opened after it.
  const requestSeq = useRef(0)
  const panelRef = useRef<HTMLElement>(null)
  // What had focus when a row was opened. Closing the panel from inside it hands focus back there.
  const openerRef = useRef<HTMLElement | null>(null)

  // The panel and the drawer are two containers for one open detail, so resizing the window across 1280px moves
  // the detail from one to the other instead of closing it.
  const inlineLog = wide && detailOpen ? currentLog : null
  const inline = inlineLog != null

  async function openDetail(row: UserLog) {
    const seq = ++requestSeq.current
    setDetailOpen(true)
    setCurrentLog(row)
    setDetailError('')
    // Without an id there is no full record to ask for, and the row is all there is to show.
    setDetailLoading(row.id != null)
    if (row.id == null) return
    try {
      const full = await userApi.getLog(row.id)
      if (seq !== requestSeq.current) return
      // The full record is the fresher one, so its fields win. The row fills in whatever it leaves out.
      setCurrentLog({ ...row, ...full })
    } catch (fetchError) {
      if (seq !== requestSeq.current) return
      // Only the message is kept. The error object carries the Authorization header, so it is never logged.
      setDetailError(getApiErrorMessage(fetchError))
    }
    setDetailLoading(false)
  }

  function retryDetail() {
    // After a failed fetch the open log is still the list row, so it can be opened again as it is.
    if (currentLog) void openDetail(currentLog)
  }

  const closeDetail = useCallback(() => {
    // An answer still on its way is for a detail that is no longer shown, so it may not write state either.
    requestSeq.current += 1
    // Closing from inside the panel removes the element that has focus, so focus goes back to where it was.
    if (panelRef.current?.contains(document.activeElement) && openerRef.current?.isConnected) {
      openerRef.current.focus({ preventScroll: true })
    }
    setDetailOpen(false)
  }, [])

  // Escape closes the panel. An open menu or dialog has taken the key already and marked it as handled, and the
  // drawer closes on Escape by itself.
  useEffect(() => {
    if (!inline) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || isField(event.target)) return
      closeDetail()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [inline, closeDetail])

  function handleSearch() {
    const params: Record<string, string | number> = { page: 1, page_size: PAGE_SIZE }
    if (filters.model) params.model = filters.model
    if (filters.status) params.status = filters.status
    if (filters.apiKeyId) params.api_key_id = filters.apiKeyId
    if (filters.startAt) params.start_at = formatDateTimeFilterValue(filters.startAt)
    if (filters.endAt) params.end_at = formatDateTimeFilterValue(filters.endAt)
    setPage(1)
    setQueryParams(params)
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
    setQueryParams({ page: 1, page_size: PAGE_SIZE })
  }

  function changePage(next: number) {
    setPage(next)
    setQueryParams((current) => ({ ...current, page: next }))
  }

  return (
    <>
      <PageHeader
        title='调用日志'
        description='按模型、状态、密钥和时间筛选 API 调用记录，点击详情查看请求与响应。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <LogFilters values={filters} onChange={setFilters} apiKeys={apiKeys} onSearch={handleSearch} onReset={handleReset} />
      {/* The table keeps its place in this wrapper whether or not the panel is open, so opening a log does not remount it. */}
      <div className={inline ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start' : undefined}>
        <LogTable
          rows={data.logs}
          loading={loading}
          selectedId={detailOpen ? currentLog?.id : undefined}
          compact={inline}
          onOpen={(row) => {
            openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            void openDetail(row)
          }}
        />
        {inlineLog ? (
          <aside className='glass flex min-w-0 animate-reveal flex-col overflow-hidden xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6.5rem)]' ref={panelRef} aria-label='日志详情'>
            {/* The body is keyed by the log, so each one starts at the top. The panel is not, so it appears only once. */}
            <LogDetail
              key={inlineLog.id}
              log={inlineLog}
              loading={detailLoading}
              error={detailError}
              onRetry={retryDetail}
              onClose={closeDetail}
            />
          </aside>
        ) : null}
      </div>
      {data.total > 0 ? (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-[13px] text-muted-foreground tabular-nums'>共 {data.total.toLocaleString()} 条</p>
          <TablePagination
            current={page}
            total={data.total}
            pageSize={PAGE_SIZE}
            onChange={changePage}
            className='min-h-0 border-0 bg-transparent px-0 py-1'
          />
        </div>
      ) : null}

      <LogDetailSheet
        open={detailOpen && !wide}
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
        log={currentLog}
        loading={detailLoading}
        error={detailError}
        onRetry={retryDetail}
      />
    </>
  )
}
