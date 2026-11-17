export type CCSwitchApp = 'claude' | 'codex'

export function buildCCSwitchLink(input: { app: CCSwitchApp; origin: string; name: string; apiKey: string; model?: string }) {
  const key = input.apiKey.trim()
  if (!key || /[\s*…]/u.test(key) || key.includes('...')) throw new Error('请输入完整 API 密钥，不能使用遮罩值')
  if (input.app !== 'claude' && input.app !== 'codex') throw new Error('不支持的客户端')
  const origin = new URL(input.origin)
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('无效的 API 地址')
  const model = input.model?.trim()
  if (input.app === 'codex' && !model) throw new Error('请输入可用的 Codex 模型名称')
  const params = new URLSearchParams({
    resource: 'provider', app: input.app, name: input.name,
    endpoint: origin.origin + (input.app === 'codex' ? '/v1' : ''),
    apiKey: key, apiFormat: input.app === 'codex' ? 'openai_responses' : 'anthropic',
    homepage: origin.origin,
  })
  if (model) params.set('model', model)
  return `ccswitch://v1/import?${params.toString()}`
}
