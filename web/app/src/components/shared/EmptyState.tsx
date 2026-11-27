import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string
  description: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex min-h-50 flex-col items-center justify-center gap-3 rounded-2xl border border-glass-border bg-glass px-6 py-10 text-center backdrop-blur-xl',
        className,
      )}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-full bg-glass-strong text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
