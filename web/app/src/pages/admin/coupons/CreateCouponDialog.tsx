import type { ReactNode } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CouponForm } from '@/pages/admin/coupons/couponForm'

type OnField = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => void

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function TextField({
  name,
  label,
  form,
  onField,
  placeholder,
  type,
}: {
  name: keyof CouponForm
  label: string
  form: CouponForm
  onField: OnField
  placeholder?: string
  type?: string
}) {
  const id = `coupon-${name}`
  return (
    <Field id={id} label={label}>
      <Input id={id} type={type} value={form[name]} onChange={(event) => onField(name, event.target.value)} placeholder={placeholder} />
    </Field>
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

/** Create a coupon: what it looks like, what it takes off, then how many there are and for how long. */
export function CreateCouponDialog({
  open,
  onOpenChange,
  form,
  onField,
  error,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: CouponForm
  onField: OnField
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  const fixed = form.discount_type === 'fixed'
  const f = { form, onField }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>创建优惠券</DialogTitle>
          <DialogDescription>金额以元为单位填写。</DialogDescription>
        </DialogHeader>
        <div className='flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1'>
          <Group title='券面'>
            <TextField name='code' label='兑换码' placeholder='留空自动生成' {...f} />
            <TextField name='title' label='名称' placeholder='如：新用户专享' {...f} />
          </Group>
          <Group title='优惠'>
            <Field id='coupon-discount_type' label='优惠类型'>
              <Select value={form.discount_type} onValueChange={(value) => onField('discount_type', value)}>
                <SelectTrigger id='coupon-discount_type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='fixed'>固定减免（¥）</SelectItem>
                  <SelectItem value='percent'>百分比折扣（%）</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <TextField
              name='discount_value'
              label={fixed ? '减免金额（¥）' : '折扣百分比'}
              placeholder={fixed ? '如：10' : '如：20（表示80折）'}
              {...f}
            />
            <TextField name='min_amount' label='最低消费（¥）' placeholder='0 = 无限制' {...f} />
            <TextField name='max_discount' label='最大优惠（¥）' placeholder='留空不限' {...f} />
          </Group>
          <Group title='发放与有效期'>
            <TextField name='total_count' label='发放总量' placeholder='留空不限' {...f} />
            <TextField name='per_user_limit' label='每人限用次数' {...f} />
            <TextField name='valid_from' label='有效期开始' type='datetime-local' {...f} />
            <TextField name='valid_until' label='有效期结束' type='datetime-local' {...f} />
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
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? '创建中...' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
