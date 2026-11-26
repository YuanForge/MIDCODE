import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type RailOption = { value: string; label: ReactNode; count?: number }

/**
 * One filter group for list pages. By default it is a vertical rail of plain rows on wide screens (the selected
 * row is tinted) and one horizontally scrolling strip below lg. With `inline` it is a single wrapping line with
 * its title in front, for a toolbar above a grid.
 */
export function FilterRailGroup({
  title,
  value,
  options,
  onChange,
  inline = false,
}: {
  title: string
  value: string
  options: RailOption[]
  onChange: (next: string) => void
  inline?: boolean
}) {
  return (
    <div
      role='group'
      aria-label={title}
      className={cn('flex min-w-0', inline ? 'flex-wrap items-center gap-x-2 gap-y-1.5' : 'flex-col gap-1.5')}
    >
      <p className={cn('text-xs font-medium text-muted-foreground', inline ? 'shrink-0' : 'px-3')}>{title}</p>
      <div
        className={cn(
          'flex gap-1',
          inline ? 'min-w-0 flex-wrap' : 'no-scrollbar -mx-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0',
        )}
      >
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type='button'
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex shrink-0 items-center justify-between gap-3 rounded-full px-3 text-[13px] whitespace-nowrap outline-none transition-colors duration-140 focus-visible:ring-2 focus-visible:ring-ring/50',
                inline ? 'h-7' : 'h-8',
                active
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className='flex min-w-0 items-center gap-2 truncate'>{option.label}</span>
              {option.count != null ? (
                <span className='text-xs tabular-nums opacity-70'>{option.count}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
