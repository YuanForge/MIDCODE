import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * One reading: a short label, a large tabular number, an optional unit and note.
 * Used where a number is the answer (balance, spend, counts) instead of boxing it in a card.
 */
export function Readout({
  label,
  value,
  unit,
  note,
  size = 'md',
  loading,
  className,
}: {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  note?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  className?: string
}) {
  return (
    <div data-slot="readout" className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[13px] leading-5 text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className={cn('rounded-md', size === 'lg' ? 'h-14 w-48' : size === 'md' ? 'h-9 w-32' : 'h-6 w-24')} />
      ) : (
        <span className="flex items-baseline gap-2 text-foreground">
          <span
            className={cn(
              'font-semibold tabular-nums',
              size === 'lg' ? 'readout' : size === 'md' ? 'text-[32px] leading-9 tracking-[-0.03em]' : 'text-xl leading-7 tracking-[-0.02em]',
            )}
          >
            {value}
          </span>
          {unit ? <span className="text-sm font-normal text-muted-foreground">{unit}</span> : null}
        </span>
      )}
      {note ? <span className="text-xs leading-5 text-muted-foreground">{note}</span> : null}
    </div>
  )
}
