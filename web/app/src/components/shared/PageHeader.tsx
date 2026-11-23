import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div data-slot="page-heading" className="flex flex-col gap-3 pb-2 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0 md:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
