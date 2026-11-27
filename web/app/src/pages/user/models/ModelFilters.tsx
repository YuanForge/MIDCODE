import type { ReactNode } from 'react'
import { SearchIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type ProviderOption = { name: string; iconUrl: string }

/** Search on the left, the result count on the right, so the count sits on the line of the query it answers. */
export function ModelSearch({
  value,
  onChange,
  placeholder,
  summary,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  summary: string
}) {
  return (
    <div role='search' className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div className='relative w-full sm:max-w-sm'>
        <SearchIcon aria-hidden className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          className='w-full pl-9'
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <p className='text-[13px] text-muted-foreground tabular-nums' aria-live='polite'>
        {summary}
      </p>
    </div>
  )
}

// A chip is a Badge rendered as a button, so the provider filter keeps the shared chip styling and the e2e selector.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Badge
      asChild
      variant={active ? 'brand' : 'outline'}
      className={cn(
        'h-7 max-w-full cursor-pointer gap-1.5 rounded-full px-3 text-[13px]',
        active ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <button type='button' aria-pressed={active} onClick={onClick}>
        {children}
      </button>
    </Badge>
  )
}

export function ProviderChips({
  title,
  allLabel,
  value,
  options,
  onChange,
}: {
  title: string
  allLabel: string
  value: string
  options: ProviderOption[]
  onChange: (next: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div role='group' aria-label={title} className='flex flex-wrap items-center gap-1.5'>
      <span className='mr-1 text-xs text-muted-foreground'>{title}</span>
      <Chip active={value === ''} onClick={() => onChange('')}>
        <span className='truncate'>{allLabel}</span>
      </Chip>
      {options.map((provider) => (
        <Chip key={provider.name} active={value === provider.name} onClick={() => onChange(provider.name)}>
          {provider.iconUrl ? (
            <img alt='' src={provider.iconUrl} className='size-4 shrink-0 rounded-full border border-glass-border bg-glass-strong object-cover' />
          ) : null}
          <span className='truncate' title={provider.name}>{provider.name}</span>
        </Chip>
      ))}
    </div>
  )
}
