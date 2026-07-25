import { createContext, createElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { publicApi } from '@/lib/api/public'
import { applyBrandTheme, clearBrandTheme } from '@/lib/brand-theme'
import { getRuntimeString } from '@/lib/runtime-env'

export type Plan = {
  credits: number
  amount: number
  origin_amount?: number
  desc?: string
  bonus?: number
}

export type SiteSettings = {
  siteName: string
  seoTitle: string
  seoDescription: string
  logoUrl: string
  themeColor: string
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

type SiteSettingsContextValue = {
  settings: SiteSettings
  status: 'loading' | 'ready' | 'error'
  loaded: boolean
  retry: () => void
  updateThemeColor: (themeColor: string) => void
}

const defaultSettings: SiteSettings = {
  siteName: getRuntimeString('site_name', 'MidCode'),
  seoTitle: '',
  seoDescription: '',
  logoUrl: getRuntimeString('logo_url'),
  themeColor: getRuntimeString('theme_color'),
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

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null)
let sharedSettingsRequest: ReturnType<typeof publicApi.getSettings> | null = null

function requestSiteSettings() {
  if (!sharedSettingsRequest) {
    sharedSettingsRequest = publicApi.getSettings().catch((error: unknown) => {
      sharedSettingsRequest = null
      throw error
    })
  }
  return sharedSettingsRequest
}

function parseSettings(response: unknown): SiteSettings {
  const maybeSettings = (response as { settings?: unknown }).settings
  const record = maybeSettings && typeof maybeSettings === 'object'
    ? maybeSettings as Record<string, unknown>
    : response as Record<string, unknown>

  return {
    siteName: getRuntimeString('site_name', String(record.site_name || 'MidCode')),
    seoTitle: String(record.seo_title || ''),
    seoDescription: String(record.seo_description || ''),
    logoUrl: getRuntimeString('logo_url', String(record.logo_url || '')),
    themeColor: String(record.theme_color || getRuntimeString('theme_color')),
    tutorialMarkdown: String(record.tutorial_markdown || ''),
    plans: (() => {
      try { return JSON.parse(String(record.recharge_plans || '[]')) as Plan[] } catch { return [] }
    })(),
    epayEnabled: record.epay_enabled === 'true',
    payApplyEnabled: record.pay_apply_enabled === 'true',
    shouqianbaEnabled: record.shouqianba_enabled === 'true',
    wechatPayEnabled: record.wechat_pay_enabled !== 'false',
    alipayEnabled: record.alipay_enabled !== 'false',
    allowCustom: record.recharge_allow_custom !== 'false',
    noticeTitle: String(record.notice_title || ''),
    noticeContent: String(record.notice_content || ''),
    contactInfo: String(record.contact_info || ''),
    qqGroupUrl: String(record.qq_group_url || ''),
    wechatCsUrl: String(record.wechat_cs_url || ''),
    qrCodeUrl: String(record.qrcode_url || ''),
    headerHtml: String(record.header_html || ''),
    footerHtml: String(record.footer_html || ''),
    showLowPriceKey: record.show_low_price_key !== 'false',
    userAgreementUrl: String(record.user_agreement_url || ''),
    userAgreementContent: String(record.user_agreement_content || ''),
  }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings)
  const [status, setStatus] = useState<SiteSettingsContextValue['status']>('loading')
  const [requestVersion, setRequestVersion] = useState(0)

  const retry = useCallback(() => {
    sharedSettingsRequest = null
    setRequestVersion((version) => version + 1)
  }, [])
  const updateThemeColor = useCallback((themeColor: string) => {
    setSettings((current) => ({ ...current, themeColor }))
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      setStatus('loading')
      try {
        const response = await requestSiteSettings()
        if (!active) return
        setSettings(parseSettings(response))
        setStatus('ready')
      } catch {
        if (!active) return
        setStatus('error')
      }
    }

    void load()
    return () => { active = false }
  }, [requestVersion])

  useEffect(() => {
    const selector = 'meta[name="description"]'
    if (status === 'loading') document.title = '加载中'
    if (status === 'error') document.title = '站点配置加载失败'
    if (status !== 'ready') {
      document.head.querySelector(selector)?.remove()
      return
    }

    document.title = settings.seoTitle || settings.siteName
    const description = settings.seoDescription.trim()
    const existing = document.head.querySelector<HTMLMetaElement>(selector)
    if (!description) {
      existing?.remove()
      return
    }
    const meta = existing ?? document.head.appendChild(document.createElement('meta'))
    meta.name = 'description'
    meta.content = description
  }, [settings.seoDescription, settings.seoTitle, settings.siteName, status])

  useLayoutEffect(() => {
    if (status !== 'ready') {
      clearBrandTheme()
      return
    }
    applyBrandTheme({ themeColor: settings.themeColor })
    return clearBrandTheme
  }, [settings.themeColor, status])

  const value = useMemo<SiteSettingsContextValue>(() => ({
    settings,
    status,
    loaded: status === 'ready',
    retry,
    updateThemeColor,
  }), [retry, settings, status, updateThemeColor])

  return createElement(SiteSettingsContext.Provider, { value }, children)
}

export function useSiteSettings() {
  const value = useContext(SiteSettingsContext)
  if (!value) throw new Error('useSiteSettings must be used within SiteSettingsProvider')
  return value
}
