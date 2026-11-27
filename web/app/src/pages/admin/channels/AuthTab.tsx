import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import type { AdminKeyPool } from '@/lib/api/admin'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { AreaField, CheckField, Opts, SelectField, type SetField } from '@/pages/admin/channels/fields'

const AUTH_TYPES = ['bearer', 'query_param', 'basic', 'sigv4']

/** How requests authenticate upstream, what is forwarded untouched, which key pool and how traffic is spread. */
export function AuthTab({ form, set, pools }: { form: ChannelForm; set: SetField; pools: AdminKeyPool[] }) {
  return (
    <div className='flex flex-col gap-6'>
      <FormGroup title='认证'>
        <SelectField id='channel-auth-type' label='认证方式' value={form.auth_type} onChange={(value) => set('auth_type', value)}>
          <Opts items={AUTH_TYPES} />
        </SelectField>
        <TextField id='channel-auth-param' label='Query Param 名' value={form.auth_param_name} onChange={(value) => set('auth_param_name', value)} placeholder='如 key（query_param 认证用）' />
        <TextField id='channel-auth-region' label='AWS Region' value={form.auth_region} onChange={(value) => set('auth_region', value)} placeholder='us-east-1（sigv4 认证用）' />
        <TextField id='channel-auth-service' label='AWS Service' value={form.auth_service} onChange={(value) => set('auth_service', value)} placeholder='execute-api（sigv4 认证用）' />
      </FormGroup>

      <FormGroup title='转发'>
        <CheckField
          id='channel-passthrough-headers'
          wide
          label='透传请求头（passthrough_headers）'
          hint='将客户端 User-Agent、Anthropic-Version 等头原样转发给上游'
          checked={form.passthrough_headers}
          onChange={(next) => set('passthrough_headers', next)}
        />
        <CheckField
          id='channel-passthrough-body'
          wide
          label='透传请求体（passthrough_body）'
          hint='跳过协议转换和脚本，原样转发原始请求体（适用于签名校验场景）'
          checked={form.passthrough_body}
          onChange={(next) => set('passthrough_body', next)}
        />
      </FormGroup>

      <FormGroup title='号池与调度'>
        <SelectField id='channel-pool' wide label='号池绑定' value={form.key_pool_id} onChange={(value) => set('key_pool_id', value)}>
          <option value=''>不启用</option>
          {pools.map((pool) => (
            <option key={pool.id} value={String(pool.id)}>
              #{pool.id} {pool.name}
            </option>
          ))}
        </SelectField>
        <TextField id='channel-priority' label='优先级' value={form.priority} onChange={(value) => set('priority', value)} placeholder='如 0' hint='数值越大越优先' />
        <TextField id='channel-weight' label='权重' value={form.weight} onChange={(value) => set('weight', value)} placeholder='如 1' hint='加权随机，越大被选中概率越高' />
      </FormGroup>

      <FormGroup title='请求头'>
        <AreaField id='channel-headers' label='请求头（JSON）' hint='固定注入到每次上游请求的 HTTP 头，如 Authorization。需要是 JSON 对象。' value={form.headers_text} onChange={(value) => set('headers_text', value)} rows={6} />
      </FormGroup>
    </div>
  )
}
