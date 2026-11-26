import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { cn } from '@/lib/utils'
import { PENDING_PLACEHOLDERS, loadPending, type PendingItem } from '@/pages/admin/dashboard/pending'

const ROW = 'flex items-center gap-4 border-b border-glass-border px-4 py-3.5 last:border-b-0'

/**
 * What needs handling, first on the workbench. It is the module the page exists for, so it floats highest. A source
 * with nothing waiting takes no row, and one that could not be read keeps its row with a dash, so an unknown count is
 * never shown as none. The calm line shows only when every source was read and none has anything waiting.
 */
export function PendingPanel() {
  // loadPending never rejects (an unread source is an item of its own), so there is no error state to show here.
  const { data: items, loading } = useAsync(loadPending, [] as PendingItem[])
  const rows = items.filter((item) => item.count !== 0)

  return (
    <section aria-label='待处理' className='glass-raised flex min-w-0 flex-col overflow-hidden'>
      <header className='flex min-h-11 shrink-0 items-center border-b border-glass-border px-4 py-2'>
        <h2 className='text-sm font-bold text-foreground'>待处理</h2>
      </header>
      {loading ? (
        <ul aria-busy='true'>
          {Array.from({ length: PENDING_PLACEHOLDERS }).map((_, i) => (
            <li key={i} className={ROW}>
              <Skeleton className='h-8 w-16 shrink-0' />
              <div className='flex min-w-0 flex-1 flex-col gap-2'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-64 max-w-full' />
              </div>
              <Skeleton className='h-8 w-20 shrink-0 rounded-full' />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className='flex flex-1 items-center px-4 py-6 text-sm text-muted-foreground'>现在没有需要处理的事。</p>
      ) : (
        <ul className='animate-arrive'>
          {rows.map((item, index) => {
            const failed = item.count == null
            return (
              <li key={item.key} className={ROW}>
                <p className='flex min-w-16 shrink-0 items-baseline gap-1'>
                  <span className='text-2xl leading-8 font-semibold tracking-[-0.025em] text-foreground tabular-nums'>
                    {item.count == null ? '—' : item.count.toLocaleString('zh-CN')}
                  </span>
                  {failed ? null : <span className='text-xs text-muted-foreground'>{item.unit}</span>}
                </p>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-medium text-foreground'>{item.name}</p>
                  <p className={cn('text-[13px] [overflow-wrap:anywhere]', failed ? 'text-destructive' : 'text-muted-foreground')}>{failed ? '加载失败' : item.detail}</p>
                </div>
                {/* Sources are listed by urgency, so the filled button always sits on the row to look at first. */}
                <Button asChild size='sm' variant={index === 0 ? 'default' : 'outline'}>
                  <Link to={item.to}>{item.action}</Link>
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
