import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { deDE, esES, frFR, jaJP, koKR, ptPT, ruRU, zhTW } from '@/i18n/extra-resources'
import { enUS, zhCN, type AppTranslationResource } from '@/i18n/resources'

export const LANGUAGE_STORAGE_KEY = 'fanapi_language'

export const supportedLanguages = [
  { code: 'en-US', label: 'English', shortLabel: 'EN', homePath: '/en' },
  { code: 'zh-CN', label: 'Chinese Simplified', shortLabel: '简', homePath: '/cn' },
  { code: 'zh-TW', label: 'Chinese Traditional', shortLabel: '繁', homePath: '/tw' },
  { code: 'es-ES', label: 'Spanish', shortLabel: 'ES', homePath: '/es' },
  { code: 'fr-FR', label: 'French', shortLabel: 'FR', homePath: '/fr' },
  { code: 'de-DE', label: 'German', shortLabel: 'DE', homePath: '/de' },
  { code: 'ja-JP', label: 'Japanese', shortLabel: '日', homePath: '/ja' },
  { code: 'ko-KR', label: 'Korean', shortLabel: '한', homePath: '/ko' },
  { code: 'pt-PT', label: 'Portuguese', shortLabel: 'PT', homePath: '/pt' },
  { code: 'ru-RU', label: 'Russian', shortLabel: 'RU', homePath: '/ru' },
] as const

export type AppLanguage = (typeof supportedLanguages)[number]['code']

export const DEFAULT_LANGUAGE: AppLanguage = 'zh-CN'

const translationResources = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'es-ES': esES,
  'fr-FR': frFR,
  'de-DE': deDE,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'pt-PT': ptPT,
  'ru-RU': ruRU,
} satisfies Record<AppLanguage, AppTranslationResource>

export function isSupportedLanguage(language: string | null | undefined): language is AppLanguage {
  return supportedLanguages.some((item) => item.code === language)
}

function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

export function getLanguageFromHomePath(pathname: string): AppLanguage | undefined {
  const normalized = normalizePath(pathname)
  return supportedLanguages.find((language) => language.homePath === normalized)?.code
}

export function getHomePathForLanguage(language: string | null | undefined) {
  const languageCode = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE
  return supportedLanguages.find((item) => item.code === languageCode)?.homePath ?? '/cn'
}

export function isLocalizedHomePath(pathname: string) {
  const normalized = normalizePath(pathname)
  return normalized === '/' || supportedLanguages.some((language) => language.homePath === normalized)
}

function getStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE

  const routeLanguage = getLanguageFromHomePath(window.location.pathname)
  if (routeLanguage) {
    return routeLanguage
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (isSupportedLanguage(stored)) {
    return stored
  }

  return DEFAULT_LANGUAGE
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(translationResources).map(([language, translation]) => [
      language,
      { translation },
    ])
  ),
  lng: getStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
})

i18n.on('languageChanged', (language) => {
  if (typeof window === 'undefined') return
  if (isSupportedLanguage(language)) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language
  }
})

if (typeof window !== 'undefined' && isSupportedLanguage(i18n.language)) {
  document.documentElement.lang = i18n.language
}

export { i18n }
