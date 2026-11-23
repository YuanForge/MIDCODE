import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'

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
    <Card className={className}>
      <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{filters}</div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}
