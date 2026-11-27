import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import type { AdminModelProvider } from '@/lib/api/admin'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { CheckField, Opts, SelectField, type GateField, type SetField } from '@/pages/admin/channels/fields'
import { GroupTags } from '@/pages/admin/channels/GroupTags'
import { IconField } from '@/pages/admin/channels/IconField'

const TYPES = ['llm', 'image', 'video', 'audio', 'music']
const PROTOCOLS = ['openai', 'claude', 'gemini', 'responses', 'realtime']
const METHODS = ['POST', 'GET']

/** Name, model, provider, upstream address, and how the channel is shown to users. */
export function BasicTab({
  form,
  set,
  gate,
  providers,
  activeProviders,
}: {
  form: ChannelForm
  set: SetField
  gate: GateField
  providers: AdminModelProvider[]
  activeProviders: AdminModelProvider[]
}) {
  // A disabled provider stays on the list for the channel that already uses it, so saving does not move it silently.
  const current = form.id ? providers.find((provider) => provider.id === form.model_provider_id) : undefined
  const options = current && !activeProviders.some((provider) => provider.id === current.id) ? [...activeProviders, current] : activeProviders

  return (
    <div className='flex flex-col gap-6'>
      <FormGroup title='接入'>
        <TextField id='channel-name' label='路由名称' value={form.name} onChange={(value) => set('name', value)} />
        <TextField id='channel-model' label='标准模型名' value={form.model} onChange={(value) => gate({ model: value })} />
        <SelectField id='channel-provider' label='模型企业' value={String(form.model_provider_id || '')} onChange={(value) => set('model_provider_id', Number(value))}>
          <option value=''>请选择企业</option>
          {options.map((provider) => (
            <option key={provider.id} value={provider.id} disabled={provider.is_active === false}>
              {provider.name}
              {provider.is_active === false ? '（已停用）' : ''}
            </option>
          ))}
        </SelectField>
        <SelectField id='channel-type' label='接口类型' value={form.type} onChange={(value) => set('type', value)}>
          <Opts items={TYPES} />
        </SelectField>
        <SelectField id='channel-protocol' label='协议' value={form.protocol} onChange={(value) => set('protocol', value)}>
          <Opts items={PROTOCOLS} />
        </SelectField>
        <SelectField id='channel-method' label='请求方法' value={form.method} onChange={(value) => set('method', value)}>
          <Opts items={METHODS} />
        </SelectField>
        <TextField id='channel-base-url' wide label='上游 URL' value={form.base_url} onChange={(value) => set('base_url', value)} placeholder='https://api.example.com/v1/chat/completions' />
        <TextField id='channel-timeout' label='超时（ms）' value={form.timeout_ms} onChange={(value) => set('timeout_ms', value)} />
      </FormGroup>

      <FormGroup title='展示'>
        <TextField id='channel-display-name' label='自定义展示名' value={form.display_name} onChange={(value) => set('display_name', value)} placeholder='留空则用户端显示标准模型名' hint='相同展示名的渠道会归为同一个模型。' />
        <TextField id='channel-description' label='描述' value={form.description} onChange={(value) => set('description', value)} placeholder='可选，显示在渠道名称下方' />
        <IconField value={form.icon_url} onChange={(value) => set('icon_url', value)} />
        <GroupTags value={form.groups} onChange={(next) => set('groups', next)} />
        <CheckField id='channel-active' wide label='渠道启用' checked={form.is_active} onChange={(next) => set('is_active', next)} />
      </FormGroup>
    </div>
  )
}
