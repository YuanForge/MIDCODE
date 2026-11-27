import type { CreateResellerSitePayload, ResellerKey } from '@/lib/api/reseller'

export type SiteForm = {
  apiKeyId: string
  siteName: string
  logoUrl: string
  domain: string
  profitRatio: string
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
}

export const initialForm: SiteForm = {
  apiKeyId: '',
  siteName: '',
  logoUrl: '',
  domain: '',
  profitRatio: '1.7',
  smtpHost: '',
  smtpPort: '465',
  smtpUser: '',
  smtpPassword: '',
  smtpFrom: '',
}

export type PayloadResult = { payload: CreateResellerSitePayload } | { error: string }

/** Validate the form and build the request body. Pure, so the dialog can show the message where the person is looking. */
export function buildSitePayload(form: SiteForm, activeKeys: ResellerKey[]): PayloadResult {
  if (activeKeys.length === 0) return { error: '请先生成可用 API Key，再搭建代理站' }
  if (!form.siteName.trim()) return { error: '请输入代理站名称' }
  if (!form.smtpHost.trim() || !form.smtpUser.trim() || !form.smtpPassword.trim() || !form.smtpFrom.trim()) {
    return { error: '请填写完整 SMTP 配置' }
  }
  const profitRatio = Number.parseFloat(form.profitRatio)
  if (!Number.isFinite(profitRatio) || profitRatio < 1) return { error: '利润倍率不能小于 1' }
  const smtpPort = Number.parseInt(form.smtpPort || '465', 10)
  return {
    payload: {
      api_key_id: Number.parseInt(form.apiKeyId || String(activeKeys[0]?.id ?? 0), 10),
      site_name: form.siteName.trim(),
      logo_url: form.logoUrl.trim(),
      domain: form.domain.trim(),
      profit_ratio: profitRatio,
      smtp_host: form.smtpHost.trim(),
      smtp_port: Number.isFinite(smtpPort) ? smtpPort : 465,
      smtp_user: form.smtpUser.trim(),
      smtp_password: form.smtpPassword,
      smtp_from: form.smtpFrom.trim(),
    },
  }
}
