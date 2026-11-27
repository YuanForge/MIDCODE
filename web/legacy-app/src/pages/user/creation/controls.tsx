import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {hint}
      </div>
      {children}
    </div>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  getLabel,
}: {
  options: T[]
  value: T
  onChange: (value: T) => void
  getLabel?: (value: T) => ReactNode
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-input bg-transparent p-1">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'min-w-[40px] flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {getLabel ? getLabel(option) : option}
          </button>
        )
      })}
    </div>
  )
}
