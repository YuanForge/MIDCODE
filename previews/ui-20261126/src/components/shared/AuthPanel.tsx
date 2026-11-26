import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Sign-in sheet content (ledger): the heading, the form, and a ruled footer for the secondary action.
 * The title is the route's one h1.
 */
export function AuthPanel({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div data-slot='auth-panel' className={cn('flex flex-col gap-6', className)}>
      <div className='flex flex-col gap-2'>
        <h1 className='text-[clamp(1.5rem,2.2vw,1.875rem)] leading-tight font-extrabold tracking-[-0.01em] text-foreground'>{title}</h1>
        {description ? <p className='text-sm leading-6 text-pretty text-muted-foreground'>{description}</p> : null}
      </div>
      {children}
      {footer ? (
        <div className='flex flex-wrap items-center justify-center gap-x-1 border-t border-glass-border pt-4 text-center text-sm text-muted-foreground'>
          {footer}
        </div>
      ) : null}
    </div>
  )
}

/** A labelled field; `aside` sits on the label line (for a secondary link such as a password reset). */
export function AuthField({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string
  htmlFor: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor={htmlFor} className='text-sm font-medium'>
          {label}
        </Label>
        {aside}
      </div>
      {children}
    </div>
  )
}
