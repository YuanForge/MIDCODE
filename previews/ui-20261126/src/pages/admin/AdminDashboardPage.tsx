import { PageHeader } from '@/components/shared/PageHeader'
import { Stat, StatStrip } from '@/components/shared/Stat'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminStatsResponse } from '@/lib/api/admin'
import { fmtCredits, profitClass } from '@/pages/admin/dashboard/format'
import { FAILING } from '@/pages/admin/dashboard/pending'
import { PendingPanel } from '@/pages/admin/dashboard/PendingPanel'
import { TopPanel } from '@/pages/admin/dashboard/TopPanel'
import { TrendPanel } from '@/pages/admin/dashboard/TrendPanel'

const money = (value: number | undefined) => `¥${fmtCredits(value)}`
/** A count the server sent, or two dashes when it left the field out: an unknown is never shown as zero. */
const count = (value: number | undefined) => (value == null ? '--' : value.toLocaleString('zh-CN'))

/**
 * Workbench. An operator opens the back office to handle things, so the page leads with what is waiting. Under it
 * the readings go from the nearest to the furthest: how today is going (calls, failures, money), who and what the
 * platform has (sign-ups, accounts, channels), then the lifetime ledger, and last the trend panel beside today's
 * ranking. What is waiting loads on its own, so its failure never takes the page down.
 */
export function AdminDashboardPage() {
  const { data: stats, loading, error, reload } = useAsync(() => adminApi.getStats(), {} as AdminStatsResponse)

  const revenue = stats.total?.revenue
  const margin = revenue ? (((stats.total?.profit ?? 0) / revenue) * 100) : null
  const channelsText =
    stats.active_channels != null ? `${stats.active_channels} / ${stats.channels ?? '--'}` : String(stats.channels ?? '--')
  // A share of nothing is not zero percent: with no calls today, or without the counts, there is no rate to show.
  const calls = stats.today?.calls
  const failedCalls = stats.today?.failed_calls
  const failureRate = calls && failedCalls != null ? (failedCalls / calls) * 100 : null

  return (
    <>
      <PageHeader
        title='平台运营看板'
        description='待处理事项与平台核心运营指标。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PendingPanel />

      <StatStrip>
        <Stat label='今日调用' value={count(calls)} note='调用日志条数，不含进行中的' loading={loading} />
        <Stat
          label='今日失败率'
          value={failureRate === null ? '--' : `${failureRate.toFixed(2)}%`}
          note={calls === 0 ? '今日还没有调用' : failedCalls != null ? `失败 ${failedCalls.toLocaleString('zh-CN')} 次` : undefined}
          valueClassName={failureRate !== null && failureRate >= FAILING.rate ? 'text-destructive' : undefined}
          loading={loading}
        />
        <Stat label='今日收入' value={money(stats.today?.revenue)} note={`今日结算 ${stats.today?.count ?? 0} 笔`} loading={loading} />
        <Stat label='今日利润' value={money(stats.today?.profit)} note='收入 - 上游成本' loading={loading} />
      </StatStrip>

      <StatStrip className='lg:grid-cols-3'>
        <Stat label='今日新注册' value={count(stats.today?.new_users)} note='今日注册的普通用户' loading={loading} />
        <Stat label='用户数量' value={String(stats.total_users ?? stats.users ?? '--')} note='普通用户数' loading={loading} />
        <Stat label='渠道数量' value={channelsText} note='活跃 / 全部' loading={loading} />
      </StatStrip>

      <StatStrip className={margin === null ? 'lg:grid-cols-3' : undefined}>
        <Stat label='累计营收' value={money(stats.total?.revenue)} note='历史全部结算' loading={loading} />
        <Stat label='累计成本' value={money(stats.total?.cost)} note='上游 API 消耗' loading={loading} />
        <Stat label='累计利润' value={money(stats.total?.profit)} note='历史净利润（含今日）' valueClassName={profitClass(stats.total?.profit)} loading={loading} />
        {margin !== null ? (
          <Stat label='综合利润率' value={`${margin.toFixed(2)}%`} note='累计利润 ÷ 累计营收' valueClassName={profitClass(margin)} loading={loading}>
            <div role='img' aria-label={`利润率 ${margin.toFixed(2)}%`} className='mt-1 h-1 w-full overflow-hidden rounded-full bg-muted'>
              <div className='h-full rounded-full bg-chart-1' style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }} />
            </div>
          </Stat>
        ) : null}
      </StatStrip>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start'>
        <TrendPanel />
        <TopPanel />
      </div>
    </>
  )
}
