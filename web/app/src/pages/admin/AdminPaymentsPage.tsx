import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Section } from '@/components/shared/Section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminPaymentDailySummary, type AdminPaymentOrder, type AdminPaymentSummary } from '@/lib/api/admin'
import { OrdersTable } from '@/pages/admin/payments/OrdersTable'
import { PaymentFilters } from '@/pages/admin/payments/PaymentFilters'
import { DailyProfit, ProfitReadouts } from '@/pages/admin/payments/ProfitPanel'
import { PAGE_SIZE, buildPaymentParams, emptyFilters, type PaymentFilterState } from '@/pages/admin/payments/format'

/** Top-ups and card redemptions together: the profit they brought in, day by day, then every record. */
export function AdminPaymentsPage() {
  const [filters, setFilters] = useState<PaymentFilterState>(emptyFilters)
  const [page, setPage] = useState(1)
  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({ page: 1, size: PAGE_SIZE })

  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listPaymentOrders(queryParams)
    return {
      orders: res.orders ?? [],
      total: res.total ?? 0,
      summary: res.summary ?? {},
      daily: res.daily ?? [],
    }
  }, {
    orders: [] as AdminPaymentOrder[],
    total: 0,
    summary: {} as AdminPaymentSummary,
    daily: [] as AdminPaymentDailySummary[],
  }, [queryParams])

  function search() {
    setPage(1)
    setQueryParams(buildPaymentParams(filters, 1))
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
        title='充值订单'
        description='在线支付与卡密兑换统一展示，按下单时间和兑换时间排序统计毛利润。'
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

      <PaymentFilters value={filters} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onSearch={search} onReset={reset} />

      <ProfitReadouts summary={data.summary} loading={loading} />
      <DailyProfit daily={data.daily} loading={loading} />

      <Section title='订单与兑换记录'>
        <OrdersTable rows={data.orders} loading={loading} page={page} total={data.total} onPage={changePage} />
      </Section>
    </>
  )
}
