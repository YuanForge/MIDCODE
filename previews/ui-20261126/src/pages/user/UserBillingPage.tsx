import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Section } from '@/components/shared/Section'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/hooks/use-async'
import { useAuth } from '@/hooks/use-auth'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { userApi } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'
import { cn } from '@/lib/utils'
import { CardRedemptionSection } from './CardRedemptionSection'
import { OrdersPanel } from './billing/OrdersPanel'
import { PayDialog } from './billing/PayDialog'
import { PaySummary } from './billing/PaySummary'
import { PlanOption } from './billing/PlanOption'
import { TransactionsPanel } from './billing/TransactionsPanel'
import { useCoupon } from './billing/useCoupon'
import { usePayment, type PayMethod } from './billing/usePayment'

/**
 * Recharge sheet (ledger). The account column (balance, model credits, settlement) and the two work
 * sections share one grid. Source order is model credits, card redemption, then packages; on phones the
 * packages are moved to the top with `order`, and on desktop grid placement puts them first in the left column.
 */
export function UserBillingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'recharge'

  const { settings } = useSiteSettings()
  const { user } = useAuth()
  const { data: balanceCredits, reload: reloadBalance } = useAsync(async () => {
    const res = await userApi.getBalance()
    return res.balance_credits ?? 0
  }, 0)
  const { data: modelCredits } = useAsync(async () => {
    const res = await userApi.getModelCredits()
    return res.model_credits ?? []
  }, [])

  const [selectedPlan, setSelectedPlan] = useState<number>(-1)
  const [selectedAmount, setSelectedAmount] = useState<number | ''>('')
  const [pickedMethod, setPickedMethod] = useState<PayMethod | null>(null)
  // Until a method is picked, the first enabled one is used. It is derived here, so no effect has to correct it.
  const payMethod: PayMethod = pickedMethod ?? (!settings.wechatPayEnabled && settings.alipayEnabled ? 'alipay' : 'wechat')
  const amountNumber = Number(selectedAmount) || 0
  const coupon = useCoupon(amountNumber)
  const payable = coupon.result ? coupon.result.final_amount : amountNumber
  const payment = usePayment({ method: payMethod, onPaid: reloadBalance })

  function choosePlan(index: number, amount: number) {
    setSelectedPlan(index)
    setSelectedAmount(amount)
    coupon.reset()
  }

  function typeAmount(value: string) {
    setSelectedPlan(-1)
    setSelectedAmount(value ? Number(value) : '')
    coupon.reset()
  }

  const paymentEnabled = settings.epayEnabled || settings.payApplyEnabled || settings.shouqianbaEnabled
  const selectedPlanInfo = selectedPlan >= 0 ? settings.plans?.[selectedPlan] : undefined
  const planLabel = selectedPlanInfo
    ? `${selectedPlanInfo.credits} 积分${selectedPlanInfo.bonus ? `（+${selectedPlanInfo.bonus}）` : ''}`
    : amountNumber > 0 ? '自定义金额' : '未选择'
  const payMethods = [
    settings.wechatPayEnabled ? { value: 'wechat' as const, label: '微信支付' } : null,
    settings.alipayEnabled ? { value: 'alipay' as const, label: '支付宝' } : null,
  ].filter((item): item is { value: PayMethod; label: string } => Boolean(item))

  return (
    <>
      <PageHeader title='积分充值' description='充值或兑换积分，并查看余额流水与订单记录。' />

      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value })} className='w-full gap-6'>
        <TabsList variant='line' className='w-full justify-start'>
          <TabsTrigger value='recharge'>积分充值</TabsTrigger>
          <TabsTrigger value='transactions'>余额流水</TabsTrigger>
          <TabsTrigger value='orders'>订单记录</TabsTrigger>
        </TabsList>

        <TabsContent value='recharge'>
          <div className='grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]'>
            <aside className='order-2 flex min-w-0 flex-col lg:sticky lg:top-6 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1'>
              <Card className='gap-0 py-0'>
                <div className='flex flex-col gap-1 p-5'>
                  <h2 className='text-[13px] font-normal text-muted-foreground'>当前积分</h2>
                  <p className='flex items-baseline gap-1.5'>
                    <span className='text-[32px] leading-10 font-semibold tracking-[-0.02em] text-foreground tabular-nums'>{formatCredits(balanceCredits)}</span>
                    <span className='text-sm text-muted-foreground'>积分</span>
                  </p>
                  <p className='text-xs text-muted-foreground'>积分永不过期，随时可用</p>
                </div>
                <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-glass-border px-5 py-4 text-[13px]'>
                  <dt className='text-muted-foreground'>用户名</dt>
                  <dd className='truncate text-right font-medium'>{user?.username || '—'}</dd>
                  <dt className='text-muted-foreground'>分组</dt>
                  <dd className='truncate text-right font-medium'>{user?.group || '默认'}</dd>
                  <dt className='text-muted-foreground'>邮箱</dt>
                  <dd className='truncate text-right font-medium'>{user?.email || '未绑定'}</dd>
                </dl>
                {modelCredits.length > 0 ? (
                  <div className='border-t border-glass-border px-5 pt-5 pb-5'>
                    <Section title="专属模型积分" description='仅可用于指定模型，优先于通用积分消耗'>
                      <ul className='flex flex-col divide-y divide-glass-border border-y border-glass-border'>
                        {modelCredits.map((mc, i) => (
                          <li key={mc.id ?? i} className='flex items-center justify-between gap-3 py-2 text-[13px]'>
                            <span className='truncate font-mono text-xs'>{mc.model_name}</span>
                            <span className='shrink-0 font-medium tabular-nums'>{formatCredits(mc.credits ?? 0)} 积分</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  </div>
                ) : null}
                {paymentEnabled ? (
                  <div className='border-t border-glass-border bg-glass-strong/60 p-5'>
                    <PaySummary
                      methods={payMethods}
                      method={payMethod}
                      onMethod={setPickedMethod}
                      coupon={coupon}
                      planLabel={planLabel}
                      amount={amountNumber}
                      payable={payable}
                      paying={payment.paying}
                      onPay={() => {
                        // A code that was typed but not validated would be dropped silently and the full price charged, so it is refused here.
                        const code = coupon.code.trim()
                        if (code && !coupon.result) {
                          toast.error('优惠券还没有验证：点「验证」使用它，或清空券码后再支付')
                          return
                        }
                        void payment.pay({ selectedAmount, couponCode: coupon.result ? code : undefined })
                      }}
                    />
                  </div>
                ) : null}
              </Card>
            </aside>

            <div className={cn('order-3 min-w-0 lg:order-none lg:col-start-1', paymentEnabled ? 'lg:row-start-2' : 'lg:row-start-1')}>
              <CardRedemptionSection purchaseUrl={settings.cardPurchaseUrl} onRedeemed={reloadBalance} />
            </div>

            {paymentEnabled ? (
              <Section
                title="选择充值套餐" panel
                description='选择套餐或输入自定义金额，在右侧确认实付金额后发起支付。'
                className='order-1 min-w-0 lg:order-none lg:col-start-1 lg:row-start-1'
              >
                {settings.plans?.length ? (
                  <div role='group' aria-label='充值套餐' className='flex flex-col divide-y divide-glass-border'>
                    {settings.plans.map((plan, i) => (
                      <PlanOption
                        key={i}
                        credits={plan.credits}
                        bonus={plan.bonus}
                        amount={plan.amount}
                        originAmount={plan.origin_amount}
                        desc={plan.desc}
                        active={selectedPlan === i}
                        onSelect={() => choosePlan(i, plan.amount)}
                      />
                    ))}
                  </div>
                ) : null}
                {!settings.plans?.length || settings.allowCustom ? (
                  <div className='flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='flex flex-col'>
                      <Label htmlFor='recharge-custom-amount' className='text-sm'>自定义金额</Label>
                      <span className='text-xs text-muted-foreground'>输入后将取消已选套餐</span>
                    </div>
                    <div className='relative w-full sm:w-56'>
                      <span aria-hidden className='pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground'>¥</span>
                      <Input
                        id='recharge-custom-amount'
                        type='number'
                        className='pl-7 tabular-nums'
                        value={selectedPlan === -1 ? selectedAmount : ''}
                        onChange={(event) => typeAmount(event.target.value)}
                        min={1}
                        max={10000}
                        placeholder='请输入金额'
                      />
                    </div>
                  </div>
                ) : null}
              </Section>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value='transactions'>
          <TransactionsPanel />
        </TabsContent>

        <TabsContent value='orders'>
          <OrdersPanel />
        </TabsContent>
      </Tabs>

      <PayDialog
        open={payment.frameOpen}
        onOpenChange={payment.onFrameOpenChange}
        payUrl={payment.payUrl}
        outTradeNo={payment.outTradeNo}
        payable={payable}
        methodLabel={payMethod === 'wechat' ? '微信' : '支付宝'}
        onClaimPaid={() => {
          payment.onFrameOpenChange(false)
          reloadBalance()
        }}
      />
    </>
  )
}
