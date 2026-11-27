import { createElement, useContext, type ComponentType, type ReactNode } from 'react'

import { PageIconContext } from '@/components/shared/page-icon-context'
import { cn } from '@/lib/utils'

/**
 * Console heading: the page's icon on a small tinted tile, a large title with a muted description under it, and
 * the page actions on the same row. The icon is the one the rail uses for this page, so the rail and the heading
 * name the place the same way. It sits straight on the canvas, with no rule.
 * `eyebrow` is kept for API compatibility and is not rendered.
 */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  /** Overrides the icon that comes from the navigation entry. */
  icon?: ComponentType<{ className?: string }>
  className?: string
}) {
  const navIcon = useContext(PageIconContext)
  const Icon = icon ?? navIcon

  return (
    <div data-slot='page-header' className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className='flex min-w-0 flex-1 items-center gap-4'>
        {Icon ? (
          <span
            aria-hidden
            data-slot='page-icon'
            className='hidden size-12 shrink-0 items-center justify-center rounded-2xl border border-glass-border bg-accent/70 text-accent-foreground sm:flex [&_svg]:size-6'
          >
            {createElement(Icon)}
          </span>
        ) : null}
        <div className='min-w-0'>
          <h1 className='text-[clamp(1.6rem,2.6vw,2.25rem)] leading-tight font-extrabold tracking-[-0.03em] text-foreground [overflow-wrap:anywhere] [word-break:keep-all]'>{title}</h1>
          {description ? <p className='mt-1 max-w-3xl text-sm leading-6 text-pretty text-muted-foreground'>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className='flex shrink-0 flex-wrap items-center gap-2'>{actions}</div> : null}
    </div>
  )
}
