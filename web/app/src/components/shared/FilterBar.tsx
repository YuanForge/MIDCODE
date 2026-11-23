import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

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
    <div className={cn("workspace-filters", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{filters}</div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}
