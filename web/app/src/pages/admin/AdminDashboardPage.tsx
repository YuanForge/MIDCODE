import { useState } from 'react'
import { ActivityIcon, BadgeDollarSignIcon, UsersIcon, ZapIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi, type AdminStatsResponse, type AdminTrendPoint, type AdminTopStats } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

type TrendDim = 'revenue' | 'cost' | 'profit' | 'calls'
type TrendDays = 7 | 30

const DIM_LABELS: Record<TrendDim, string> = {
  revenue: '收入',
  cost: '成本',
  profit: '利润',
  calls: '调用量',
}

function fmtCredits(v: number | undefined) {
  if (v == null) return '--'
  return (v / 1_000_000).toFixed(4)
}

function profitColor(v: number | undefined) {
  if (v == null) return ''
  return v >= 0 ? 'text-emerald-600' : 'text-red-500'
}

function MiniTrendChart({ points, color }: { points: AdminTrendPoint[]; color: string }) {
  const values = points.map((p) => p.value)
  const max = Math.max(...values, 0.001)
  const W = 500
  const H = 80
  const step = points.length > 1 ? W / (points.length - 1) : W
  const path = points
    .map((p, i) => {
      const x = i * step
      const y = H - (p.value / max) * H
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const areaPath =
    path + ` L ${((points.length - 1) * step).toFixed(1)} ${H} L 0 ${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendSection() {
  const [days, setDays] = useState<TrendDays>(7)
  const [dim, setDim] = useState<TrendDim>('revenue')

  const { data, loading } = useAsync(
    () => adminApi.getStatsTrend(days, dim),
    { points: [] as AdminTrendPoint[], dim: 'revenue', days: 7 },
    [days, dim],
  )

  const dimColor: Record<TrendDim, string> = {
    revenue: '#10b981',
    cost: '#ef4444',
    profit: '#3b82f6',
    calls: '#8b5cf6',
  }

  const formatVal = (v: number) =>
    dim === 'calls' ? v.toLocaleString('zh-CN') : `¥${v.toFixed(4)}`

  const maxVal = Math.max(...(data.points.map((p) => p.value)), 0.001)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">趋势曲线</CardTitle>
        <div className="flex items-center gap-2">
          {/* 维度切换 */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            {(Object.keys(DIM_LABELS) as TrendDim[]).map((d) => (
              <button
                key={d}
                onClick={() => setDim(d)}
                className={`px-2.5 py-1 transition-colors ${dim === d ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {DIM_LABELS[d]}
              </button>
            ))}
          </div>
          {/* 时间范围 */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            {([7, 30] as TrendDays[]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 transition-colors ${days === d ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:bg-muted'}`}
              >
                近{d}天
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : (
          <div className="h-32 w-full">
            <MiniTrendChart points={data.points} color={dimColor[dim]} />
          </div>
        )}
        {/* x 轴标签：每隔 N 天显示一个 */}
        {!loading && data.points.length > 0 ? (
          <div className="mt-1 flex justify-between px-0.5">
            {data.points.filter((_, i) => i === 0 || i === Math.floor((data.points.length - 1) / 2) || i === data.points.length - 1).map((p) => (
              <span key={p.label} className="text-[10px] text-muted-foreground">{p.label}</span>
            ))}
          </div>
        ) : null}
        {/* 汇总数字 */}
        {!loading ? (
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">{DIM_LABELS[dim]}区间合计</p>
              <p className="text-lg font-bold" style={{ color: dimColor[dim] }}>
                {formatVal(data.points.reduce((s, p) => s + p.value, 0))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">峰值</p>
              <p className="text-sm font-semibold">{formatVal(maxVal)}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TopSection() {
  const [tab, setTab] = useState<'users' | 'models' | 'channels'>('users')
  const { data, loading } = useAsync(
    () => adminApi.getStatsTop(),
    { users: [], models: [], channels: [] } as AdminTopStats,
  )

  const tabLabels = { users: 'TOP 用户', models: 'TOP 模型', channels: 'TOP 渠道' }
  const rows = data[tab]
  const maxVal = Math.max(...rows.map((r) => r.value), 0.001)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">今日 TOP 10</CardTitle>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(Object.keys(tabLabels) as Array<'users' | 'models' | 'channels'>).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 transition-colors ${tab === t ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded" />)
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">暂无今日数据</p>
        ) : (
          rows.map((row, i) => (
            <div key={row.id} className="flex items-center gap-2">
              <span className={`w-5 text-xs font-bold shrink-0 ${i < 3 ? 'text-foreground' : 'text-muted-foreground'}`}>
                {i + 1}
              </span>
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm truncate">{row.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {tab === 'models' ? row.value.toLocaleString('zh-CN') + ' 次' : `¥${row.value.toFixed(4)}`}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${(row.value / maxVal) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function AdminDashboardPage() {
  const { data: stats, loading, error, reload } = useAsync(
    () => adminApi.getStats(),
    {} as AdminStatsResponse,
  )

  const marginPct = (() => {
    const r = stats.total?.revenue
    const p = stats.total?.profit
    if (!r) return null
    return ((p ?? 0) / r * 100).toFixed(2)
  })()

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="平台运营看板"
        description="平台核心运营指标：渠道、用户、今日收入与累计利润。"
        actions={
          error ? (
            <Button size="sm" variant="outline" onClick={reload}>
              重试
            </Button>
          ) : null
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* 第一行：核心指标 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="渠道数量"
          value={stats.active_channels != null
            ? `${stats.active_channels} / ${stats.channels ?? '--'}`
            : String(stats.channels ?? '--')}
          hint="活跃 / 全部"
          icon={<ZapIcon className="size-4" />}
          loading={loading}
          variant="info"
        />
        <StatCard
          title="用户数量"
          value={String(stats.total_users ?? stats.users ?? '--')}
          hint="普通用户数"
          icon={<UsersIcon className="size-4" />}
          loading={loading}
          variant="primary"
        />
        <StatCard
          title="今日收入"
          value={`¥${fmtCredits(stats.today?.revenue)}`}
          hint={`今日结算 ${stats.today?.count ?? 0} 笔`}
          icon={<BadgeDollarSignIcon className="size-4" />}
          loading={loading}
          variant="success"
        />
        <StatCard
          title="今日利润"
          value={`¥${fmtCredits(stats.today?.profit)}`}
          hint="收入 - 上游成本"
          icon={<ActivityIcon className="size-4" />}
          loading={loading}
          variant="warning"
        />
      </div>

      {/* 第二行：累计数据 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">累计营收</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{fmtCredits(stats.total?.revenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">历史全部结算</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">累计成本</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{fmtCredits(stats.total?.cost)}</p>
            <p className="mt-1 text-xs text-muted-foreground">上游 API 消耗</p>
          </CardContent>
        </Card>
        <Card className={stats.total?.profit != null && stats.total.profit >= 0 ? 'border-l-4 border-l-emerald-500' : stats.total?.profit != null ? 'border-l-4 border-l-red-500' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">累计利润</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${profitColor(stats.total?.profit)}`}>
              ¥{fmtCredits(stats.total?.profit)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">历史净利润（含今日）</p>
          </CardContent>
        </Card>
      </div>

      {/* 利润率 */}
      {marginPct !== null ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">综合利润率</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${profitColor(parseFloat(marginPct))}`}>
              {marginPct}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">累计利润 ÷ 累计营收</p>
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${parseFloat(marginPct) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(Math.max(parseFloat(marginPct), 0), 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 趋势曲线 + TOP 榜并排 */}
      <div className="grid gap-4 xl:grid-cols-2">
        <TrendSection />
        <TopSection />
      </div>
    </>
  )
}

