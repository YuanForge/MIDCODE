import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** A labelled text input. The id ties the label to the input, so the field has a name for keyboards and screen readers. */
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type,
  hint,
  wide,
  min,
  step,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
  hint?: string
  wide?: boolean
  min?: number
  step?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', wide && 'sm:col-span-2')}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  )
}
