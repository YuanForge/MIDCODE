import { AreaRow, ReadOnlyRow, TextRow } from '@/pages/admin/settings/controls'
import { binder, type SetSetting, type SettingsMap } from '@/pages/admin/settings/settingsModel'

type Props = { form: SettingsMap; set: SetSetting }

/** Where the payment provider calls back into this system. The dev server port is dropped from the origin. */
function callbackUrl(path: string) {
  return `${window.location.origin.replace(':3001', '')}${path}`
}

export function EpayFields({ form, set }: Props) {
  const bind = binder(form, set)
  return (
    <>
      <TextRow label='易支付地址' placeholder='https://your-epay.com' hint='易支付平台的域名（不含末尾斜杠）' {...bind('epay_url')} />
      <TextRow label='商户 PID' placeholder='您的易支付商户 PID' {...bind('epay_pid')} />
      <TextRow label='商户密钥' type='password' placeholder='您的易支付商户密钥' {...bind('epay_key')} />
      <TextRow label='异步通知地址' placeholder='https://api.yoursite.com/pay/epay/callback' hint='易支付回调到本系统的地址，必须可从公网访问' {...bind('epay_notify_url')} />
      <TextRow label='同步跳转地址' placeholder='https://yoursite.com/billing' hint='用户支付成功后跳回的前端页面地址' {...bind('epay_return_url')} />
    </>
  )
}

export function PayApplyFields({ form, set }: Props) {
  const bind = binder(form, set)
  return (
    <>
      <TextRow label='中台根地址' placeholder='https://pay.example.com' hint='支付中台的域名（不含末尾斜杠）' {...bind('pay_apply_urlroot')} />
      <TextRow label='中台商品 Key' type='password' placeholder='支付中台分配的商品 key' hint='中台回调时会携带此 key 用于验签，请妥善保管' {...bind('pay_apply_key')} />
      <ReadOnlyRow id='setting-pay_apply_notify_url' label='回调地址' hint='将此地址填写到支付中台的回调配置中，必须可从公网访问' value={callbackUrl('/pay/apply/notify')} />
    </>
  )
}

export function ShouqianbaFields({ form, set }: Props) {
  const bind = binder(form, set)
  const notifyUrl = callbackUrl('/pay/shouqianba/notify')
  return (
    <>
      <TextRow label='API 域名' placeholder='https://vsi-api.shouqianba.com' hint='收钱吧接入域名（不含末尾斜杠）' {...bind('shouqianba_api_domain')} />
      <TextRow label='终端号 terminal_sn' placeholder='收钱吧终端号' {...bind('shouqianba_terminal_sn')} />
      <TextRow label='终端密钥 terminal_key' type='password' placeholder='收钱吧终端密钥' {...bind('shouqianba_terminal_key')} />
      <AreaRow label='收钱吧公钥' rows={4} kind='code' placeholder='-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----' hint='用于验证收钱吧回调签名（SHA256WithRSA）' {...bind('shouqianba_public_key')} />
      <TextRow label='异步通知地址' placeholder={notifyUrl} hint='可留空使用默认地址，需在收钱吧后台配置可公网访问' {...bind('shouqianba_notify_url', notifyUrl)} />
      <ReadOnlyRow id='setting-shouqianba_default_notify_url' label='默认回调地址' value={notifyUrl} />
    </>
  )
}
