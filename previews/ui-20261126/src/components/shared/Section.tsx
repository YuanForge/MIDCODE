import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Console section: a heading row (title, description, actions) above its content.
 * By default the heading sits on the canvas and the content brings its own surface, as a table does with one glass sheet.
 * With `panel`, the heading and the content share one glass panel, for forms and short lists.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  panel = false,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  panel?: boolean
}) {
  const hasHeading = Boolean(title || description || actions)
  return (
    <section data-slot='section' className={cn('flex flex-col gap-4', panel && 'glass p-5 sm:p-6', className)}>
      {hasHeading ? (
        <header className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
          <div className='flex min-w-0 flex-col gap-0.5'>
            {title ? <h2 className='text-[15px] leading-6 font-semibold text-foreground'>{title}</h2> : null}
            {description ? <p className='max-w-2xl text-[13px] leading-5 text-muted-foreground'>{description}</p> : null}
          </div>
          {actions ? <div className='flex shrink-0 flex-wrap items-center gap-2'>{actions}</div> : null}
        </header>
      ) : null}
      <div className='min-w-0'>{children}</div>
    </section>
  )
}
