import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Console panel: a glass sheet with a one-line title bar and an optional footer line.
 * It is the one container for a block of a page, so blocks line up on a grid. Rows inside it stay solid.
 */
export function Panel({
  title,
  meta,
  actions,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section data-slot='panel' className={cn('glass flex min-w-0 flex-col overflow-hidden', className)}>
      <header className='flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-glass-border px-4 py-2'>
        <h2 className='min-w-0 truncate text-sm font-bold text-foreground'>{title}</h2>
        {meta || actions ? (
          <div className='flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground'>
            {meta}
            {actions}
          </div>
        ) : null}
      </header>
      <div className={cn('min-w-0 flex-1', bodyClassName)}>{children}</div>
      {footer ? <footer className='border-t border-glass-border px-4 py-2.5 text-xs text-muted-foreground'>{footer}</footer> : null}
    </section>
  )
}
