import { useEffect, useState } from 'react'
import { getRuntimeString } from '@/lib/runtime-env'
import { publicApi } from '@/lib/api/public'

export type Plan = {
  credits: number
  amount: number
  origin_amount?: number
  desc?: string
  bonus?: number
}

export type SiteSettings = {
  siteName: string
  logoUrl: string
  tutorialMarkdown: string
  plans: Plan[]
  epayEnabled: boolean
  payApplyEnabled: boolean
  shouqianbaEnabled: boolean
  wechatPayEnabled: boolean
  alipayEnabled: boolean
  allowCustom: boolean
  noticeTitle: string
  noticeContent: string
  contactInfo: string
  qqGroupUrl: string
  wechatCsUrl: string
  qrCodeUrl: string
  headerHtml: string
  footerHtml: string
  showLowPriceKey: boolean
  userAgreementUrl: string
  userAgreementContent: string
}

const defaultSettings: SiteSettings = {
  siteName: getRuntimeString('site_name', 'MidCode'),
  logoUrl: getRuntimeString('logo_url'),
  tutorialMarkdown: '',
  plans: [],
  epayEnabled: false,
  payApplyEnabled: false,
  shouqianbaEnabled: false,
  wechatPayEnabled: true,
  alipayEnabled: true,
  allowCustom: false,
  noticeTitle: '',
  noticeContent: '',
  contactInfo: '',
  qqGroupUrl: '',
  wechatCsUrl: '',
  qrCodeUrl: '',
  headerHtml: '',
  footerHtml: '',
  showLowPriceKey: true,
  userAgreementUrl: '',
  userAgreementContent: '',
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const response = await publicApi.getSettings()
        const maybeSettings = (response as { settings?: unknown }).settings
        const record =
          maybeSettings && typeof maybeSettings === 'object'
            ? (maybeSettings as Record<string, any>)
            : (response as Record<string, any>)
        setSettings({
          siteName: getRuntimeString('site_name', record.site_name || 'MidCode'),
          logoUrl: getRuntimeString('logo_url', record.logo_url || ''),
          tutorialMarkdown: record.tutorial_markdown || '',
          plans: (() => {
            try { return JSON.parse(record.recharge_plans || '[]') } catch { return [] }
          })(),
          epayEnabled: record.epay_enabled === 'true',
          payApplyEnabled: record.pay_apply_enabled === 'true',
          shouqianbaEnabled: record.shouqianba_enabled === 'true',
          wechatPayEnabled: record.wechat_pay_enabled !== 'false',
          alipayEnabled: record.alipay_enabled !== 'false',
          allowCustom: record.recharge_allow_custom !== 'false',
          noticeTitle: record.notice_title || '',
          noticeContent: record.notice_content || '',
          contactInfo: record.contact_info || '',
          qqGroupUrl: record.qq_group_url || '',
          wechatCsUrl: record.wechat_cs_url || '',
          qrCodeUrl: record.qrcode_url || '',
          headerHtml: record.header_html || '',
          footerHtml: record.footer_html || '',
          showLowPriceKey: record.show_low_price_key !== 'false',
          userAgreementUrl: record.user_agreement_url || '',
          userAgreementContent: record.user_agreement_content || '',
        })
      } catch {
        setSettings(defaultSettings)
      } finally {
        setLoaded(true)
      }
    }

    void load()
  }, [])

  useEffect(() => {
    document.title = settings.siteName
  }, [settings.siteName])

  return { settings, loaded }
}
