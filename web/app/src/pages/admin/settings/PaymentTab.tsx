import type { ReactNode } from 'react'

import { SettingGroup, ToggleRow } from '@/pages/admin/settings/controls'
import { EpayFields, PayApplyFields, ShouqianbaFields } from '@/pages/admin/settings/PaymentFields'
import type { SetSetting, SettingsMap } from '@/pages/admin/settings/settingsModel'

const PROVIDERS = ['epay_enabled', 'pay_apply_enabled', 'shouqianba_enabled'] as const
type Provider = (typeof PROVIDERS)[number]

/** Card sales, the one online payment provider that is switched on, and which payment methods users see. The card address field comes from the page. */
export function PaymentTab({ form, set, cardPurchase }: { form: SettingsMap; set: SetSetting; cardPurchase: ReactNode }) {
  // Only one online provider can be on at a time: turning one on turns the others off.
  function chooseProvider(key: Provider, on: boolean) {
    set(key, on ? 'true' : 'false')
    if (!on) return
    for (const other of PROVIDERS) {
      if (other !== key) set(other, 'false')
    }
  }

  const toggle = (key: Provider, label: string, hint: string) => (
    <ToggleRow id={`setting-${key}`} label={label} hint={hint} checked={form[key] === 'true'} onChange={(on) => chooseProvider(key, on)} />
  )

  return (
    <div className='flex flex-col gap-8'>
      <SettingGroup title='卡密'>{cardPurchase}</SettingGroup>

      <SettingGroup title='在线支付' description='三种在线支付同一时间只能启用一种，开启其中一种会自动关闭另外两种。'>
        {toggle('epay_enabled', '启用易支付', '开启后用户可以通过易支付（支付宝/微信）充值余额')}
        {form.epay_enabled === 'true' ? <EpayFields form={form} set={set} /> : null}
        {toggle('pay_apply_enabled', '启用中台支付', '开启后用户可通过支付中台（微信/支付宝）充值余额')}
        {form.pay_apply_enabled === 'true' ? <PayApplyFields form={form} set={set} /> : null}
        {toggle('shouqianba_enabled', '启用收钱吧', '开启后用户可通过收钱吧（微信/支付宝）充值余额')}
        {form.shouqianba_enabled === 'true' ? <ShouqianbaFields form={form} set={set} /> : null}
      </SettingGroup>

      <SettingGroup title='支付方式'>
        <ToggleRow
          id='setting-wechat_pay_enabled'
          label='开启微信支付'
          hint='关闭后用户充值页将不显示微信支付按钮'
          checked={form.wechat_pay_enabled !== 'false'}
          onChange={(on) => set('wechat_pay_enabled', on ? 'true' : 'false')}
        />
        <ToggleRow
          id='setting-alipay_enabled'
          label='开启支付宝'
          hint='关闭后用户充值页将不显示支付宝按钮'
          checked={form.alipay_enabled !== 'false'}
          onChange={(on) => set('alipay_enabled', on ? 'true' : 'false')}
        />
      </SettingGroup>
    </div>
  )
}
