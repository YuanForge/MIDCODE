import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import type { AdminUpstreamPlatform } from '@/lib/api/admin'
import { BillingFields } from '@/pages/admin/channels/BillingFields'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { AreaField, SelectField, type GateField, type SetField } from '@/pages/admin/channels/fields'
import { UpstreamCostPanel } from '@/pages/admin/channels/UpstreamCostPanel'
import type { UpstreamCost } from '@/pages/admin/channels/useUpstreamCost'

const ADVANCED_PLACEHOLDER = JSON.stringify(
  {
    metric_paths: { input_tokens: 'response.usage.prompt_tokens', output_tokens: 'response.usage.completion_tokens' },
    resolution_tiers: [{ max_pixels: 1048576, multiplier: 1.0 }],
  },
  null,
  2
)

/** Upstream cost binding, the billing type with its markup and costs, and the JSON for everything else. */
export function BillingTab({
  form,
  set,
  gate,
  platforms,
  cost,
}: {
  form: ChannelForm
  set: SetField
  gate: GateField
  platforms: AdminUpstreamPlatform[]
  cost: UpstreamCost
}) {
  return (
    <div className='flex flex-col gap-6'>
      <FormGroup title='上游成本同步'>
        <UpstreamCostPanel form={form} set={set} gate={gate} platforms={platforms} cost={cost} />
      </FormGroup>

      <FormGroup title='计费方式'>
        <SelectField id='channel-billing-type' label='计费类型' value={form.billing_type} onChange={(value) => set('billing_type', value)}>
          <option value='token'>token — 按 token 数计费</option>
          <option value='image'>image — 按图片张数计费</option>
          <option value='video'>video — 按视频秒数计费</option>
          <option value='audio'>audio — 按音频秒数计费</option>
          <option value='count'>count — 按调用次数计费</option>
        </SelectField>
        <TextField id='channel-markup' type='number' step='0.01' label='利润倍率' value={form.billing_markup} onChange={(value) => gate({ billing_markup: value })} placeholder='如 1.2' hint='售价 = 成本 × 倍率。例如填 1.2 表示利润 20%。' />
      </FormGroup>

      <BillingFields form={form} set={set} />

      <FormGroup title='高级配置'>
        <AreaField
          id='channel-billing-config'
          label='高级配置（JSON）'
          hint='用于配置 metric_paths、resolution_tiers 等非价格参数，需要是 JSON 对象；结构化价格字段会在保存时覆盖同名键。VIP 折扣请在“VIP 分组”页面统一配置。'
          value={form.billing_config_text}
          onChange={(value) => set('billing_config_text', value)}
          rows={8}
          placeholder={ADVANCED_PLACEHOLDER}
        />
      </FormGroup>
    </div>
  )
}
