import { buildBillingConfig } from '@/pages/admin/channels/billingConfig'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { parseJsonField } from '@/pages/admin/channels/config'

const NUMBER_FIELDS: Array<{ label: string; key: 'timeout_ms' | 'query_timeout_ms' | 'priority' | 'weight' }> = [
  { label: '超时', key: 'timeout_ms' },
  { label: '轮询超时', key: 'query_timeout_ms' },
  { label: '优先级', key: 'priority' },
  { label: '权重', key: 'weight' },
]

/** What is wrong with the form, or an empty string when it can be saved. */
export function validateChannelForm(form: ChannelForm): string {
  if (!form.name.trim()) return '请填写路由名称'
  if (!form.model.trim()) return '请填写标准模型名'
  if (!form.base_url.trim()) return '请填写上游 URL'
  for (const field of NUMBER_FIELDS) {
    const value = form[field.key].trim()
    if (value !== '' && !Number.isFinite(Number(value))) return `${field.label}需要是数字`
  }
  return ''
}

/** The body of a create or update request. Throws with the field's name if a JSON box or the Fast ratio is invalid. */
export function buildChannelPayload(form: ChannelForm) {
  return {
    name: form.name.trim(),
    model: form.model.trim(),
    model_provider_id: form.model_provider_id,
    type: form.type,
    protocol: form.protocol,
    base_url: form.base_url.trim(),
    method: form.method,
    query_url: form.query_url.trim(),
    query_method: form.query_method,
    timeout_ms: Number(form.timeout_ms || '60000'),
    query_timeout_ms: Number(form.query_timeout_ms || '30000'),
    billing_type: form.billing_type,
    headers: parseJsonField('请求头', form.headers_text),
    billing_config: buildBillingConfig(form),
    billing_script: form.billing_script,
    request_script: form.request_script,
    response_script: form.response_script,
    query_script: form.query_script,
    error_script: form.error_script,
    key_pool_id: Number(form.key_pool_id || '0'),
    auth_type: form.auth_type,
    auth_param_name: form.auth_param_name.trim(),
    auth_region: form.auth_region.trim(),
    auth_service: form.auth_service.trim(),
    passthrough_headers: form.passthrough_headers,
    passthrough_body: form.passthrough_body,
    weight: Number(form.weight || '1'),
    priority: Number(form.priority || '0'),
    icon_url: form.icon_url.trim(),
    description: form.description.trim(),
    display_name: form.display_name.trim(),
    groups: form.groups,
    is_active: form.is_active,
  }
}

/** The upstream platform, model, group and markup that cost detection and sync work from. */
export function buildUpstreamCostPayload(form: ChannelForm) {
  const markup = Number(form.billing_markup || '1')
  return {
    platform_id: Number(form.upstream_platform_id || '0'),
    model: form.upstream_model.trim() || form.model.trim(),
    group: form.upstream_group.trim(),
    markup: markup > 0 ? markup : 1,
  }
}
