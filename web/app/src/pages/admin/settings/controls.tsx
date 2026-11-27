import { useRef, useState, type ReactNode } from 'react'
import { UploadIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { cn } from '@/lib/utils'
import type { Bound } from '@/pages/admin/settings/settingsModel'

type AreaKind = 'plain' | 'code' | 'large'

const AREA_CLASS: Record<AreaKind, string> = {
  plain: '[field-sizing:fixed] max-h-36 min-h-24 resize-y overflow-auto',
  code: '[field-sizing:fixed] max-h-36 min-h-24 resize-y overflow-auto font-mono text-xs',
  large: '[field-sizing:fixed] h-64 max-h-80 min-h-40 resize-y overflow-auto font-mono text-xs',
}

/** A titled run of rows inside a tab, set off from the next one by a rule under its heading. */
export function SettingGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className='flex flex-col'>
      <header className='border-b border-glass-border pb-2'>
        <h3 className='text-sm font-medium'>{title}</h3>
        {description ? <p className='mt-0.5 text-xs text-muted-foreground'>{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

/** One setting: its name on the left, the control and its hint on the right. Stacks on narrow screens. */
export function Field({ id, label, hint, children }: { id?: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className='grid gap-2 border-b border-glass-border py-4 last:border-b-0 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6'>
      {id ? (
        <Label htmlFor={id} className='pt-2 text-sm font-medium'>
          {label}
        </Label>
      ) : (
        <span className='pt-2 text-sm font-medium'>{label}</span>
      )}
      <div role={id ? undefined : 'group'} aria-label={id ? undefined : label} className='flex min-w-0 max-w-3xl flex-col gap-1.5'>
        {children}
        {hint ? <p className='text-xs leading-relaxed text-muted-foreground'>{hint}</p> : null}
      </div>
    </div>
  )
}

type RowProps = Bound & { label: string; hint?: ReactNode; placeholder?: string }

export function TextRow({ id, value, onChange, label, hint, placeholder, type, mono }: RowProps & { type?: string; mono?: boolean }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn(mono && 'font-mono text-xs')} />
    </Field>
  )
}

export function AreaRow({ id, value, onChange, label, hint, placeholder, rows, kind = 'plain' }: RowProps & { rows?: number; kind?: AreaKind }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Textarea id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={AREA_CLASS[kind]} />
    </Field>
  )
}

export function NumberRow({
  id,
  value,
  onChange,
  label,
  hint,
  placeholder,
  unit,
  min,
  max,
  step,
  width = 'w-32',
}: RowProps & { unit?: string; min?: number; max?: number; step?: number; width?: string }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <div className='flex items-center gap-2'>
        <Input id={id} type='number' value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={width} />
        {unit ? <span className='text-sm text-muted-foreground'>{unit}</span> : null}
      </div>
    </Field>
  )
}

export function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: ReactNode; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <label htmlFor={id} className='flex w-fit cursor-pointer items-center gap-2 text-sm'>
        <input id={id} type='checkbox' className='size-4 accent-primary' checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {checked ? '已开启' : '已关闭'}
      </label>
    </Field>
  )
}

/** A value the system works out, such as a callback address: shown to be copied, never edited. */
export function ReadOnlyRow({ id, label, hint, value }: { id: string; label: string; hint?: ReactNode; value: string }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Input id={id} readOnly value={value} className='bg-glass-strong/50 font-mono text-xs' />
    </Field>
  )
}

/** An image given as a URL or uploaded from disk. An upload that fails says so under this field. */
export function ImageRow({ id, value, onChange, label, hint, placeholder, previewAlt, previewClass }: RowProps & { previewAlt: string; previewClass?: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const response = await adminApi.uploadImage(file, 'site-setting')
      const url = response.url ?? ''
      if (!url) throw new Error('上传失败，未返回图片地址')
      onChange(url)
      toast.success('图片上传成功')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field id={id} label={label} hint={hint}>
      <div className='flex gap-2'>
        <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className='flex-1' />
        <Button type='button' variant='outline' onClick={() => fileRef.current?.click()} disabled={uploading}>
          <UploadIcon data-icon='inline-start' />
          {uploading ? '上传中...' : '上传'}
        </Button>
      </div>
      <input
        ref={fileRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={(event) => {
          void upload(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      {error ? (
        <p role='alert' className='text-xs text-destructive'>
          {error}
        </p>
      ) : null}
      {value ? <img src={value} alt={previewAlt} className={cn('mt-1 rounded-md border border-glass-border bg-glass-strong/50 object-contain p-1', previewClass ?? 'size-28')} /> : null}
    </Field>
  )
}
