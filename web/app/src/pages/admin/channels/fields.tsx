import type { ReactNode } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'

/** Sets one field of the channel form. */
export type SetField = <K extends keyof ChannelForm>(key: K, value: ChannelForm[K]) => void

/** Sets fields that decide what the upstream price list returns. Auto-sync goes off until the cost is checked again. */
export type GateField = (patch: Partial<ChannelForm>) => void

export function Hint({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <p className={cn('text-xs text-muted-foreground', wide && 'sm:col-span-2')}>{children}</p>
}

/** Options for a native select, one per string. */
export function Opts({ items }: { items: readonly string[] }) {
  return (
    <>
      {items.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </>
  )
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  wide,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  children: ReactNode
  wide?: boolean
  hint?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', wide && 'sm:col-span-2')}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </NativeSelect>
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  )
}

/** A checkbox whose label and explanation sit beside it. Clicking the label toggles it. */
export function CheckField({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
  wide,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  wide?: boolean
}) {
  return (
    <div className={cn('flex items-start gap-2.5', wide && 'sm:col-span-2')}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(next === true)} className='mt-0.5' />
      <div className='flex flex-col gap-0.5'>
        <Label htmlFor={id} className='cursor-pointer'>
          {label}
        </Label>
        {hint ? <Hint>{hint}</Hint> : null}
      </div>
    </div>
  )
}

/** A monospaced text area for JSON and scripts. It always takes the full row. */
export function AreaField({
  id,
  label,
  hint,
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <div className='flex flex-col gap-1.5 sm:col-span-2'>
      <Label htmlFor={id}>{label}</Label>
      {hint ? <Hint>{hint}</Hint> : null}
      <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} spellCheck={false} className='font-mono text-xs' />
    </div>
  )
}
