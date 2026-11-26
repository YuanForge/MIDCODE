import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { formatCnyValue } from '@/pages/admin/channels/config'
import { CheckField, Hint, type SetField } from '@/pages/admin/channels/fields'

type TextKey = { [K in keyof ChannelForm]-?: ChannelForm[K] extends string ? K : never }[keyof ChannelForm]

const FAST_HINT = '留空表示该渠道不支持 Fast。倍率同时应用于标准售价和上游成本；GPT Priority 倍率因模型而异，不能统一按 2 倍处理。Claude Fast 会自动添加 beta header，具体支持模型以上游官方为准。'

/** What the Fast ratio works out to at the current costs and markup, or nothing while the ratio is empty. */
function fastPreview(form: ChannelForm) {
  const ratio = Number(form.billing_fast_ratio)
  if (!form.billing_fast_ratio || !(ratio > 0)) return undefined
  const markup = Number(form.billing_markup || '1')
  const cny = (cost: string) => formatCnyValue(Number(cost || '0') * markup * ratio)
  let text = `Fast 输入约 CNY ${cny(form.billing_input_cost)} / 百万 token；Fast 输出约 CNY ${cny(form.billing_output_cost)} / 百万 token`
  if (form.billing_cache_create_cost) text += `；缓存写入约 CNY ${cny(form.billing_cache_create_cost)} / 百万 token`
  if (form.billing_cache_read_cost) text += `；缓存读取约 CNY ${cny(form.billing_cache_read_cost)} / 百万 token`
  return `${text}。`
}

/** The cost fields for the chosen billing type. Selling prices are not typed in. They are worked out from cost × markup on save. */
export function BillingFields({ form, set }: { form: ChannelForm; set: SetField }) {
  const money = (key: TextKey, id: string, label: string, placeholder: string) => (
    <TextField id={id} type='number' label={label} value={form[key]} onChange={(value) => set(key, value)} placeholder={placeholder} />
  )

  switch (form.billing_type) {
    case 'token': {
      const preview = fastPreview(form)
      return (
        <FormGroup title='成本价格（按 token）'>
          {money('billing_input_cost', 'billing-input-cost', '输入成本（CNY / 百万 token）', '如 0.612')}
          {money('billing_output_cost', 'billing-output-cost', '输出成本（CNY / 百万 token）', '如 4.9')}
          {money('billing_cache_create_cost', 'billing-cache-create-cost', '缓存写入成本（CNY / 百万 token）', '留空按协议默认')}
          {money('billing_cache_read_cost', 'billing-cache-read-cost', '缓存读取成本（CNY / 百万 token）', '留空按协议默认')}
          <TextField id='billing-fast-ratio' type='number' min={0.01} step='0.01' wide label='Fast 倍率' value={form.billing_fast_ratio} onChange={(value) => set('billing_fast_ratio', value)} placeholder='如 2.0' hint={FAST_HINT} />
          {preview ? <Hint wide>{preview}</Hint> : null}
          <CheckField id='billing-input-from-response' wide label='从响应中获取实际输入 token 数（input_from_response）' checked={form.billing_input_from_response} onChange={(next) => set('billing_input_from_response', next)} />
        </FormGroup>
      )
    }
    case 'image':
      return (
        <FormGroup title='成本价格（按图片）'>
          <Hint wide>填写后按 1k/2k/3k/4k 档位优先计费；留空则使用基础成本。</Hint>
          {money('billing_size_cost_1k', 'billing-size-1k', '1k 进价（CNY / 张）', '如 2.5')}
          {money('billing_size_cost_2k', 'billing-size-2k', '2k 进价（CNY / 张）', '如 4.2')}
          {money('billing_size_cost_3k', 'billing-size-3k', '3k 进价（CNY / 张）', '如 6.2')}
          {money('billing_size_cost_4k', 'billing-size-4k', '4k 进价（CNY / 张）', '如 7.8')}
          {money('billing_default_size_cost', 'billing-size-default', '兜底尺寸进价（CNY）', 'size 不在表中时使用')}
          {money('billing_base_cost', 'billing-base-cost', '基础进价（CNY，档位留空时生效）', '如 4.2')}
        </FormGroup>
      )
    case 'video':
    case 'audio':
      return <FormGroup title='成本价格（按秒）'>{money('billing_cost_per_second', 'billing-per-second', '进价（CNY / 秒）', '如 0.008')}</FormGroup>
    case 'count':
      return <FormGroup title='成本价格（按次）'>{money('billing_cost_per_call', 'billing-per-call', '进价（CNY / 次）', '如 0.0008')}</FormGroup>
    default:
      return null
  }
}
