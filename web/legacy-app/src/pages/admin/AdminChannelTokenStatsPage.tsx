import { useState } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannelTokenStatsResponse } from '@/lib/api/admin'
import { formatTokenCount, tokenStatsTodayRange } from '@/lib/token-usage'

export function AdminChannelTokenStatsPage() {
  const { id } = useParams()
  const location = useLocation()
  const channelId = Number(id)
  const [range, setRange] = useState(tokenStatsTodayRange)
  const [bucket, setBucket] = useState<'hour' | 'day'>('hour')
  const { data, loading, error, reload } = useAsync(
    () => adminApi.getChannelTokenStats(channelId, {
      start_at: range.startAt,
      end_at: range.endAt,
      bucket,
    }),
    {
      channel: { id: channelId, name: '', model: '', protocol: '' },
      totals: { non_cached_input_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, output_tokens: 0, total_tokens: 0 },
      points: [],
      start_at: '',
      end_at: '',
    } as AdminChannelTokenStatsResponse,
    [channelId, range.startAt, range.endAt, bucket],
  )

  return (
    <>
      <PageHeader
        eyebrow={`渠道 #${data.channel.id || channelId}`}
        title={data.channel.name || '渠道 Token 统计'}
        description={`${data.channel.model || '加载中'} · ${data.channel.protocol || '—'} · 当前范围总 Token ${formatTokenCount(data.totals.total_tokens)}`}
        actions={
          <Button variant="outline" asChild>
            <Link to={`/admin/channels${location.search}`}>
              <ArrowLeftIcon data-icon="inline-start" />返回渠道列表
            </Link>
          </Button>
        }
      />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <FilterBar
        filters={
          <>
            <DateRangeFilter
              label="时间"
              startAt={range.startAt}
              endAt={range.endAt}
              onChange={setRange}
            />
            <div className="flex rounded-lg border border-input bg-muted/40 p-1" aria-label="聚合粒度">
              {(['hour', 'day'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={bucket === value}
                  onClick={() => setBucket(value)}
                  className={`h-9 rounded-md px-3 text-sm transition-colors ${bucket === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {value === 'hour' ? '按小时' : '按天'}
                </button>
              ))}
            </div>
          </>
        }
        actions={<Button variant="outline" onClick={reload}>刷新</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="非缓存输入" value={formatTokenCount(data.totals.non_cached_input_tokens)} loading={loading} />
        <StatCard title="缓存读取" value={formatTokenCount(data.totals.cache_read_tokens)} loading={loading} />
        <StatCard title="缓存写入" value={formatTokenCount(data.totals.cache_creation_tokens)} loading={loading} />
        <StatCard title="输出" value={formatTokenCount(data.totals.output_tokens)} loading={loading} />
      </div>

      <ChannelTokenTrend data={data} loading={loading} />
    </>
  )
}

function ChannelTokenTrend({ data, loading }: { data: AdminChannelTokenStatsResponse; loading: boolean }) {
  const max = Math.max(...data.points.map((point) => point.total_tokens), 1)

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          <h2>Token 使用趋势</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.points.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">当前时间范围没有成功调用。</div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex h-64 min-w-max items-end gap-3 border-b px-2 pt-6">
              {data.points.map((point) => (
                <div key={point.label} className="flex w-14 shrink-0 flex-col items-center justify-end gap-2">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{formatTokenCount(point.total_tokens)}</span>
                  <div
                    className="w-8 rounded-t bg-primary"
                    style={{ height: `${Math.max((point.total_tokens / max) * 168, 4)}px` }}
                    title={`${point.label}: ${formatTokenCount(point.total_tokens)}`}
                  />
                  <span className="whitespace-nowrap text-[10px] text-muted-foreground">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
