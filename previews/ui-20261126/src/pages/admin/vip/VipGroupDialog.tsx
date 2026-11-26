import type { ReactNode } from 'react'
import { SaveIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { VipForm } from '@/pages/admin/vip/vipForm'

type TextKey = Exclude<keyof VipForm, 'id' | 'is_active'>
type OnField = <K extends keyof VipForm>(key: K, value: VipForm[K]) => void

function TextField({
  name,
  label,
  form,
  onField,
  placeholder,
  type,
  wide,
}: {
  name: TextKey
  label: string
  form: VipForm
  onField: OnField
  placeholder?: string
  type?: string
  wide?: boolean
}) {
  const id = `vip-${name}`
  return (
    <div className={wide ? 'flex flex-col gap-1.5 sm:col-span-2' : 'flex flex-col gap-1.5'}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={form[name]} onChange={(event) => onField(name, event.target.value)} placeholder={placeholder} />
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-3 border-t border-glass-border pt-4 first:border-t-0 first:pt-0'>
      <p className='text-sm font-medium'>{title}</p>
      <div className='grid gap-4 sm:grid-cols-2'>{children}</div>
    </div>
  )
}

/** Create or edit a VIP tier: what it is called, then what it takes to get in and what it takes off. */
export function VipGroupDialog({
  open,
  onOpenChange,
  form,
  onField,
  error,
  saving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: VipForm
  onField: OnField
  error: string
  saving: boolean
  onSubmit: () => void
}) {
  const f = { form, onField }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{form.id ? '编辑 VIP 等级' : '新增 VIP 等级'}</DialogTitle>
          <DialogDescription>累计储值达到门槛的用户会自动进入该分组，并按折扣计费。</DialogDescription>
        </DialogHeader>
        <div className='flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1'>
          <Group title='分组'>
            <TextField name='code' label='分组标识' placeholder='如 vip1' {...f} />
            <TextField name='name' label='显示名称' placeholder='如 VIP 1' {...f} />
            <TextField name='description' label='说明' placeholder='可选，后台备注' wide {...f} />
          </Group>
          <Group title='规则'>
            <TextField name='recharge_threshold_cny' label='累计储值门槛（CNY）' type='number' placeholder='如 100' {...f} />
            <TextField name='discount_percent' label='售价折扣（%）' type='number' placeholder='如 85' {...f} />
            <TextField name='sort_order' label='排序' type='number' {...f} />
            <label className='flex items-center gap-2 text-sm sm:pt-6'>
              <input type='checkbox' checked={form.is_active} onChange={(event) => onField('is_active', event.target.checked)} className='size-4 accent-primary' />
              启用
            </label>
          </Group>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            <SaveIcon data-icon='inline-start' />
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
