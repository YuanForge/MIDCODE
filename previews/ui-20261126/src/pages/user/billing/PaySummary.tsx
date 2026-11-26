import { LoaderCircleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { useCoupon } from '@/pages/user/billing/useCoupon'
import type { PayMethod } from '@/pages/user/billing/usePayment'

type Coupon = ReturnType<typeof useCoupon>
type MethodOption = { value: PayMethod; label: string }

/**
 * Settlement column of the recharge sheet: payment method, coupon, then the amounts as a short ruled
 * statement that ends in the one number that is charged.
 */
export function PaySummary({
  methods,
  method,
  onMethod,
  coupon,
  planLabel,
  amount,
  payable,
  paying,
  onPay,
}: {
  methods: MethodOption[]
  method: PayMethod
  onMethod: (next: PayMethod) => void
  coupon: Coupon
  planLabel: string
  amount: number
  payable: number
  paying: boolean
  onPay: () => void
}) {
  return (
    <div className='flex flex-col gap-5'>
      {methods.length > 0 ? (
        <div role='radiogroup' aria-label='支付方式' className='flex flex-col gap-2'>
          <span className='text-[13px] font-medium text-foreground'>支付方式</span>
          <div className='grid grid-cols-2 gap-2'>
            {methods.map((item) => {
              const active = method === item.value
              return (
                <button
                  key={item.value}
                  type='button'
                  role='radio'
                  aria-checked={active}
                  onClick={() => onMethod(item.value)}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-full border text-sm font-medium outline-none transition-[border-color,background-color,color] duration-140 ease-out focus-visible:ring-3 focus-visible:ring-ring/40',
                    active
                      ? 'border-brand bg-glass-strong text-foreground'
                      : 'border-glass-border bg-glass-strong/50 text-muted-foreground hover:border-input-hover hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className='flex flex-col gap-1.5'>
        <label htmlFor='recharge-coupon' className='text-[13px] font-medium text-foreground'>
          优惠券
        </label>
        <div className='flex items-center gap-2'>
          <Input
            id='recharge-coupon'
            placeholder='输入优惠券码'
            value={coupon.code}
            onChange={(event) => coupon.setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void coupon.validate()
            }}
            aria-invalid={Boolean(coupon.error)}
          />
          <Button
            variant='outline'
            className='shrink-0'
            onClick={() => void coupon.validate()}
            disabled={coupon.validating || !coupon.code.trim()}
          >
            {coupon.validating ? <LoaderCircleIcon className='animate-spin' /> : '验证'}
          </Button>
        </div>
        {coupon.error ? (
          <p role='alert' className='text-xs text-destructive'>
            {coupon.error}
          </p>
        ) : null}
        {coupon.result ? (
          <p className='text-xs font-medium text-success'>已优惠 ¥{coupon.result.discount_yuan.toFixed(2)}，到账积分不变</p>
        ) : null}
      </div>

      <dl className='flex flex-col gap-2 border-t border-glass-border pt-4 text-[13px]'>
        <div className='flex items-center justify-between gap-3'>
          <dt className='text-muted-foreground'>套餐</dt>
          <dd className='font-medium tabular-nums'>{planLabel}</dd>
        </div>
        <div className='flex items-center justify-between gap-3'>
          <dt className='text-muted-foreground'>金额</dt>
          <dd className='tabular-nums'>¥{amount.toFixed(2)}</dd>
        </div>
        {coupon.result ? (
          <div className='flex animate-reveal items-center justify-between gap-3'>
            <dt className='text-muted-foreground'>优惠</dt>
            <dd className='text-success tabular-nums'>−¥{coupon.result.discount_yuan.toFixed(2)}</dd>
          </div>
        ) : null}
        <div className='mt-1 flex items-baseline justify-between gap-3 border-t border-glass-border pt-3'>
          <dt className='text-sm font-medium text-foreground'>实付</dt>
          <dd className='text-2xl font-semibold tracking-tight text-foreground tabular-nums'>¥{payable.toFixed(2)}</dd>
        </div>
      </dl>

      <Button size='lg' className='w-full' onClick={onPay} disabled={paying || !amount}>
        {paying ? <LoaderCircleIcon className='animate-spin' data-icon='inline-start' /> : null}
        {paying ? '正在创建订单...' : `立即支付 ¥${payable.toFixed(2)}`}
      </Button>
    </div>
  )
}
