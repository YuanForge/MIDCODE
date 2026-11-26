import { useState } from 'react'

import { Panel } from '@/components/shared/Panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminTopStats } from '@/lib/api/admin'
import { Segmented } from '@/pages/admin/dashboard/Segmented'

type Tab = 'users' | 'models' | 'channels'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'users', label: 'TOP 用户' },
  { value: 'models', label: 'TOP 模型' },
  { value: 'channels', label: 'TOP 渠道' },
]

/** Today's ten largest users, models or channels. The rank numbers are real, so they stay; each row carries a bar for its share of the leader. */
export function TopPanel() {
  const [tab, setTab] = useState<Tab>('users')
  const { data, loading, error } = useAsync(() => adminApi.getStatsTop(), { users: [], models: [], channels: [] } as AdminTopStats)

  const rows = data[tab] ?? []
  const max = Math.max(...rows.map((row) => row.value), 0.001)

  return (
    <Panel title='今日 TOP 10' actions={<Segmented label='榜单类型' value={tab} options={TABS} onChange={setTab} />}>
      {loading ? (
        <div className='flex flex-col gap-2 p-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-7 w-full' />
          ))}
        </div>
      ) : error ? (
        <div className='p-3'>
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : rows.length === 0 ? (
        <p className='px-3 py-8 text-center text-sm text-muted-foreground'>暂无今日数据</p>
      ) : (
        <ol>
          {rows.map((row, i) => (
            <li key={row.id} className='border-b border-glass-border px-3 py-2 last:border-b-0'>
              <div className='flex items-baseline gap-3'>
                <span className='w-5 shrink-0 font-mono text-xs text-faint tabular-nums'>{String(i + 1).padStart(2, '0')}</span>
                <span className='min-w-0 flex-1 truncate text-[13px]'>{row.name}</span>
                <span className='shrink-0 font-mono text-xs text-muted-foreground tabular-nums'>
                  {tab === 'models' ? `${row.value.toLocaleString('zh-CN')} 次` : `¥${row.value.toFixed(4)}`}
                </span>
              </div>
              <div className='mt-1.5 ml-8 h-1 overflow-hidden rounded-full bg-muted'>
                <div className='h-full rounded-full bg-chart-1 transition-[width] duration-300 ease-out' style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
