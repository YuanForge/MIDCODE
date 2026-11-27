import { useState } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { Readout } from '@/components/shared/Readout'
import { Section } from '@/components/shared/Section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannelTokenStatsResponse } from '@/lib/api/admin'
import { formatTokenCount, tokenStatsTodayRange } from '@/lib/token-usage'
import { Segmented } from '@/pages/admin/dashboard/Segmented'

type Bucket = 'hour' | 'day'

const BUCKETS: Array<{ value: Bucket; label: string }> = [
  { value: 'hour', label: '按小时' },
  { value: 'day', label: '按天' },
]

function ChannelTokenTrend({ data, loading }: { data: AdminChannelTokenStatsResponse; loading: boolean }) {
  const max = Math.max(...data.points.map((point) => point.total_tokens), 1)

  return (
    <Section title='Token 使用趋势' panel>
      {loading ? (
        <Skeleton className='h-64 w-full' />
      ) : data.points.length === 0 ? (
        <div className='flex h-64 items-center justify-center text-sm text-muted-foreground'>当前时间范围没有成功调用。</div>
      ) : (
        <div className='overflow-x-auto pb-2'>
          <div className='flex h-64 min-w-max items-end gap-3 border-b border-glass-border px-2 pt-6'>
            {data.points.map((point) => (
              <div key={point.label} className='flex w-14 shrink-0 flex-col items-center justify-end gap-2'>
                <span className='font-mono text-[10px] text-muted-foreground tabular-nums'>{formatTokenCount(point.total_tokens)}</span>
                <div
                  className='w-8 rounded-t-sm bg-chart-1'
                  style={{ height: `${Math.max((point.total_tokens / max) * 168, 4)}px` }}
                  title={`${point.label}: ${formatTokenCount(point.total_tokens)}`}
                />
                <span className='whitespace-nowrap text-[10px] text-muted-foreground'>{point.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

/** Channel Token statistics: the four counts as readings on one ruled band, then the trend. Every number belongs to this one channel. */
export function AdminChannelTokenStatsPage() {
  const { id } = useParams()
  const location = useLocation()
  const channelId = Number(id)
  const [range, setRange] = useState(tokenStatsTodayRange)
  const [bucket, setBucket] = useState<Bucket>('hour')
  const { data, loading, error, reload } = useAsync(
    () =>
      adminApi.getChannelTokenStats(channelId, {
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

  const totals = data.totals
  const readings = [
    { label: '非缓存输入', value: totals.non_cached_input_tokens },
    { label: '缓存读取', value: totals.cache_read_tokens },
    { label: '缓存写入', value: totals.cache_creation_tokens },
    { label: '输出', value: totals.output_tokens },
  ]

  return (
    <>
      <p className='-mb-4 text-[13px] text-muted-foreground tabular-nums'>{`渠道 #${data.channel.id || channelId}`}</p>
      <PageHeader
        title={data.channel.name || '渠道 Token 统计'}
        description={`${data.channel.model || '加载中'} · ${data.channel.protocol || '—'} · 当前范围总 Token ${formatTokenCount(totals.total_tokens)}`}
        actions={
          <Button variant='outline' asChild>
            <Link to={`/admin/channels${location.search}`}>
              <ArrowLeftIcon data-icon='inline-start' />
              返回渠道列表
            </Link>
          </Button>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FilterBar
        filters={
          <>
            <DateRangeFilter label='时间' startAt={range.startAt} endAt={range.endAt} onChange={setRange} />
            <Segmented label='聚合粒度' value={bucket} options={BUCKETS} onChange={setBucket} />
          </>
        }
        actions={
          <Button variant='outline' onClick={reload}>
            刷新
          </Button>
        }
      />

      <div className='glass grid grid-cols-2 gap-8 p-6 xl:grid-cols-4'>
        {readings.map((reading) => (
          <Readout key={reading.label} size='md' label={reading.label} value={formatTokenCount(reading.value)} loading={loading} />
        ))}
      </div>

      <ChannelTokenTrend data={data} loading={loading} />
    </>
  )
}
