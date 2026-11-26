import { useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Readout } from '@/components/shared/Readout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminTransaction, type AdminTransactionSummary } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { AdjustDialog } from '@/pages/admin/billing/AdjustDialog'
import { AggregateTable } from '@/pages/admin/billing/AggregateTable'
import { BillingFilters } from '@/pages/admin/billing/BillingFilters'
import { TransactionsTable } from '@/pages/admin/billing/TransactionsTable'
import { DIMS, buildBillingParams, emptyFilters, toMoney, type AggRow, type BillingFilterState } from '@/pages/admin/billing/format'

/** Revenue, cost and profit: the detail ledger with its totals, and the same numbers summed by user, channel, model or day. */
export function AdminBillingPage() {
  const [tab, setTab] = useState('detail')
  const [filters, setFilters] = useState<BillingFilterState>(emptyFilters)
  const [page, setPage] = useState(1)
  const [searchParams, setSearchParams] = useState<Record<string, unknown>>({ page: 1 })

  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listTransactions(searchParams)
    const transactions = Array.isArray(res) ? res : res.transactions ?? res.items ?? []
    const total = Array.isArray(res) ? transactions.length : (res as { total?: number }).total ?? transactions.length
    const summary: AdminTransactionSummary = Array.isArray(res) ? {} : (res as { summary?: AdminTransactionSummary }).summary ?? {}
    return { transactions, total, summary }
  }, { transactions: [] as AdminTransaction[], total: 0, summary: {} as AdminTransactionSummary }, [searchParams])

  const aggDim = tab === 'detail' ? '' : tab
  const { data: aggData, loading: aggLoading, error: aggError } = useAsync(async () => {
    if (!aggDim) return { rows: [] as AggRow[] }
    return adminApi.getTransactionAggregate({ dim: aggDim })
  }, { rows: [] as AggRow[] }, [aggDim])

  const [adjustOpen, setAdjustOpen] = useState(false)

  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [exporting, setExporting] = useState(false)

  function updateFilter<K extends keyof BillingFilterState>(key: K, value: BillingFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function search() {
    setPage(1)
    setSearchParams(buildBillingParams(filters, 1))
  }

  function reset() {
    setFilters(emptyFilters)
    setPage(1)
    setSearchParams({ page: 1 })
  }

  function changePage(next: number) {
    setPage(next)
    setSearchParams((prev) => ({ ...prev, page: next }))
  }

  async function submitExport() {
    setExporting(true)
    try {
      await adminApi.createExportTask({ name: `账单对账单 ${exportMonth}`, type: 'billing', params: { month: exportMonth } })
      toast.success(`导出任务已提交（${exportMonth}），请前往「数据导出」页面下载。`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const hasSummary = data.summary.revenue != null || data.summary.cost != null

  return (
    <>
      <PageHeader
        title='账单流水与利润统计'
        description='按时间范围查看平台收入、成本和利润，支持运营复盘与对账。'
        actions={
          <>
            {error ? (
              <Button variant='outline' onClick={reload}>
                重试
              </Button>
            ) : null}
            <Input type='month' aria-label='导出月份' className='w-40' value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} />
            <Button variant='outline' onClick={() => void submitExport()} disabled={exporting}>
              {exporting ? '提交中…' : '导出对账单'}
            </Button>
            <Button onClick={() => setAdjustOpen(true)}>手动调账</Button>
          </>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value='detail'>明细</TabsTrigger>
          {DIMS.map((dim) => (
            <TabsTrigger key={dim.value} value={dim.value}>
              {dim.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value='detail' className='mt-4 flex flex-col gap-6'>
          <BillingFilters value={filters} onField={updateFilter} onSearch={search} onReset={reset} />
          {hasSummary ? (
            <div className='glass grid gap-8 p-6 sm:grid-cols-3'>
              <Readout size='md' label='收入' value={`¥${toMoney(data.summary.revenue)}`} loading={loading} />
              <Readout size='md' label='成本' value={`¥${toMoney(data.summary.cost)}`} loading={loading} />
              <Readout size='md' label='利润' value={`¥${toMoney(data.summary.profit)}`} loading={loading} />
            </div>
          ) : null}
          <TransactionsTable rows={data.transactions} loading={loading} page={page} total={data.total} onPage={changePage} />
        </TabsContent>

        {DIMS.map((dim) => (
          <TabsContent key={dim.value} value={dim.value} className='mt-4'>
            {aggError ? (
              <Alert variant='destructive'>
                <AlertDescription>{aggError}</AlertDescription>
              </Alert>
            ) : (
              <AggregateTable head={dim.head} rows={aggData.rows} loading={aggLoading} />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <AdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        onDone={reload}
      />
    </>
  )
}
