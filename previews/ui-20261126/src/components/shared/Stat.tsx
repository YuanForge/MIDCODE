import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export const STAT_CELL = 'flex min-w-0 flex-col gap-1 bg-glass-strong/50 px-5 py-4'

/** A row of readings on one glass sheet. Cells are split by 1px of the glass edge showing through the gap, so no cell needs its own border. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-slot='stat-strip' className={cn('glass grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4', className)}>
      {children}
    </div>
  )
}

/** One reading: a small label, a bold number, an optional unit and note. The number is its own element, so it can be found by its text. */
export function Stat({
  label,
  value,
  unit,
  note,
  loading,
  valueClassName,
  children,
}: {
  label: ReactNode
  value: string
  unit?: string
  note?: string
  loading?: boolean
  valueClassName?: string
  children?: ReactNode
}) {
  return (
    <div className={STAT_CELL}>
      <span className='text-[13px] text-muted-foreground'>{label}</span>
      {loading ? (
        <Skeleton className='h-9 w-24' />
      ) : (
        <span className='flex min-w-0 items-baseline gap-1.5'>
          <span className={cn('min-w-0 text-[clamp(1.6rem,2.3vw,2.25rem)] leading-tight font-extrabold tracking-[-0.03em] text-foreground tabular-nums [overflow-wrap:anywhere]', valueClassName)}>{value}</span>
          {unit ? <span className='shrink-0 text-xs text-muted-foreground'>{unit}</span> : null}
        </span>
      )}
      {note ? <span className='text-xs text-faint'>{note}</span> : null}
      {children}
    </div>
  )
}
