import { useRef } from 'react'

import { useSlidingIndicator } from '@/hooks/use-sliding-indicator'
import { cn } from '@/lib/utils'

/**
 * A small segmented switch for one choice out of a few. The chosen option is filled with ink, and the ink
 * capsule travels to the next choice, the same way the segmented tabs do.
 */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  useSlidingIndicator(listRef, indicatorRef, '[aria-pressed=true]')

  return (
    <div
      ref={listRef}
      role='group'
      aria-label={label}
      className='group/segmented relative inline-flex rounded-full border border-glass-border bg-glass p-0.5'
    >
      <span
        ref={indicatorRef}
        aria-hidden
        className='pointer-events-none absolute top-0 left-0 hidden rounded-full bg-foreground ease-out group-data-[indicator=ready]/segmented:block data-[animate=true]:transition-[translate,width,height] data-[animate=true]:duration-200'
      />
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type='button'
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-8 rounded-full px-3.5 text-xs outline-none transition-colors duration-140 focus-visible:ring-2 focus-visible:ring-ring/50',
              active
                ? 'bg-foreground font-medium text-background group-data-[indicator=ready]/segmented:bg-transparent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
