import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const iconWrapStyles = cva(
  'flex size-11 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5',
  {
    variants: {
      variant: {
        primary: 'bg-primary/10 text-primary',
        success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
        rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

export type StatCardVariant = NonNullable<VariantProps<typeof iconWrapStyles>['variant']>

export function StatCard({
  title,
  value,
  icon,
  hint,
  loading,
  variant,
}: {
  title: string
  value: string
  icon?: ReactNode
  hint?: string
  loading?: boolean
  variant?: StatCardVariant
}) {
  return (
    <Card className="metric-card border-border/70">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon && <span className={cn(iconWrapStyles({ variant }), 'size-7 rounded-full [&>svg]:size-4')}>{icon}</span>}
          {title}
        </div>
        {loading ? <Skeleton className="h-8 w-28" /> : <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
