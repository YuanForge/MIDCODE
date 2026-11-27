import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Filter toolbar that sits directly above the data surface it controls. It is one glass sheet, the same
 * surface as the table below it, so a list page reads as a filter sheet followed by a record sheet.
 */
export function FilterBar({
  filters,
  actions,
  className,
}: {
  filters: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="filter-bar"
      role="group"
      className={cn('glass flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between', className)}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2.5">{filters}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
