import { useState } from 'react'

import { Panel } from '@/components/shared/Panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminTrendPoint } from '@/lib/api/admin'
import { Segmented } from '@/pages/admin/dashboard/Segmented'

type Dim = 'revenue' | 'cost' | 'profit' | 'calls'
type Days = 7 | 30

const DIMS: Array<{ value: Dim; label: string }> = [
  { value: 'revenue', label: '收入' },
  { value: 'cost', label: '成本' },
  { value: 'profit', label: '利润' },
  { value: 'calls', label: '调用量' },
]

const RANGES: Array<{ value: Days; label: string }> = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
]

function TrendLine({ points }: { points: AdminTrendPoint[] }) {
  const max = Math.max(...points.map((p) => p.value), 0.001)
  const W = 500
  const H = 80
  const step = points.length > 1 ? W / (points.length - 1) : W
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(H - (p.value / max) * H).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className='h-full w-full overflow-visible text-chart-1' preserveAspectRatio='none' role='img' aria-label='趋势曲线'>
      <path d={path} fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' vectorEffect='non-scaling-stroke' />
    </svg>
  )
}

/** Trend of one measure over the last 7 or 30 days. The controls sit in the panel bar and the total and the peak in its footer. */
export function TrendPanel() {
  const [days, setDays] = useState<Days>(7)
  const [dim, setDim] = useState<Dim>('revenue')

  const { data, loading, error } = useAsync(
    () => adminApi.getStatsTrend(days, dim),
    { points: [] as AdminTrendPoint[], dim: 'revenue', days: 7 },
    [days, dim],
  )

  const points = data.points ?? []
  const label = DIMS.find((item) => item.value === dim)?.label ?? ''
  const format = (v: number) => (dim === 'calls' ? v.toLocaleString('zh-CN') : `¥${v.toFixed(4)}`)
  const total = points.reduce((sum, p) => sum + p.value, 0)
  const peak = points.length > 0 ? Math.max(...points.map((p) => p.value)) : 0
  const middle = Math.floor((points.length - 1) / 2)
  const ticks = points.filter((_, i) => i === 0 || i === middle || i === points.length - 1)
  const ready = !loading && !error && points.length > 0

  return (
    <Panel
      title='趋势曲线'
      actions={
        <>
          <Segmented label='指标' value={dim} options={DIMS} onChange={setDim} />
          <Segmented label='时间范围' value={days} options={RANGES} onChange={setDays} />
        </>
      }
      footer={
        ready ? (
          <dl className='flex items-end justify-between gap-4'>
            <div>
              <dt>{label}区间合计</dt>
              <dd className='font-mono text-sm font-semibold text-foreground tabular-nums'>{format(total)}</dd>
            </div>
            <div className='text-right'>
              <dt>峰值</dt>
              <dd className='font-mono text-sm font-semibold text-foreground tabular-nums'>{format(peak)}</dd>
            </div>
          </dl>
        ) : null
      }
    >
      <div className='flex flex-col gap-1.5 p-3'>
        {loading ? (
          <Skeleton className='h-32 w-full' />
        ) : error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : points.length === 0 ? (
          <div className='flex h-32 items-center justify-center text-sm text-muted-foreground'>暂无趋势数据</div>
        ) : (
          <div className='h-32 w-full border-b border-glass-border'>
            <TrendLine points={points} />
          </div>
        )}
        {ready ? (
          <div className='flex justify-between px-0.5'>
            {ticks.map((p) => (
              <span key={p.label} className='font-mono text-[11px] text-muted-foreground'>
                {p.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
