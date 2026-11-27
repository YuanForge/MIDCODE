import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * One setting on a ruled page: the name and what it does on the left, the control on the right.
 * Settings read as a list of lines, not as a stack of boxes.
 */
export function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      data-slot='setting-row'
      className={cn('grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14', className)}
    >
      <div className='flex flex-col gap-1'>
        <h2 className='text-[15px] leading-6 font-semibold text-foreground'>{title}</h2>
        {description ? <p className='text-[13px] leading-5 text-muted-foreground'>{description}</p> : null}
      </div>
      <div className='min-w-0 lg:max-w-xl'>{children}</div>
    </section>
  )
}
