import { CheckIcon, LanguagesIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getHomePathForLanguage,
  isLocalizedHomePath,
  supportedLanguages,
  type AppLanguage,
} from '@/i18n'
import { cn } from '@/lib/utils'

const languageLabelsByLocale: Record<AppLanguage, Record<AppLanguage, string>> = {
  'en-US': {
    'en-US': 'English',
    'zh-CN': 'Chinese Simplified',
    'zh-TW': 'Chinese Traditional',
    'es-ES': 'Spanish',
    'fr-FR': 'French',
    'de-DE': 'German',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'pt-PT': 'Portuguese',
    'ru-RU': 'Russian',
  },
  'zh-CN': {
    'en-US': '英语',
    'zh-CN': '简体中文',
    'zh-TW': '繁体中文',
    'es-ES': '西班牙语',
    'fr-FR': '法语',
    'de-DE': '德语',
    'ja-JP': '日语',
    'ko-KR': '韩语',
    'pt-PT': '葡萄牙语',
    'ru-RU': '俄语',
  },
  'zh-TW': {
    'en-US': '英文',
    'zh-CN': '簡體中文',
    'zh-TW': '繁體中文',
    'es-ES': '西班牙文',
    'fr-FR': '法文',
    'de-DE': '德文',
    'ja-JP': '日文',
    'ko-KR': '韓文',
    'pt-PT': '葡萄牙文',
    'ru-RU': '俄文',
  },
  'es-ES': {
    'en-US': 'Inglés',
    'zh-CN': 'Chino simplificado',
    'zh-TW': 'Chino tradicional',
    'es-ES': 'Español',
    'fr-FR': 'Francés',
    'de-DE': 'Alemán',
    'ja-JP': 'Japonés',
    'ko-KR': 'Coreano',
    'pt-PT': 'Portugués',
    'ru-RU': 'Ruso',
  },
  'fr-FR': {
    'en-US': 'Anglais',
    'zh-CN': 'Chinois simplifié',
    'zh-TW': 'Chinois traditionnel',
    'es-ES': 'Espagnol',
    'fr-FR': 'Français',
    'de-DE': 'Allemand',
    'ja-JP': 'Japonais',
    'ko-KR': 'Coréen',
    'pt-PT': 'Portugais',
    'ru-RU': 'Russe',
  },
  'de-DE': {
    'en-US': 'Englisch',
    'zh-CN': 'Chinesisch vereinfacht',
    'zh-TW': 'Chinesisch traditionell',
    'es-ES': 'Spanisch',
    'fr-FR': 'Französisch',
    'de-DE': 'Deutsch',
    'ja-JP': 'Japanisch',
    'ko-KR': 'Koreanisch',
    'pt-PT': 'Portugiesisch',
    'ru-RU': 'Russisch',
  },
  'ja-JP': {
    'en-US': '英語',
    'zh-CN': '簡体字中国語',
    'zh-TW': '繁体字中国語',
    'es-ES': 'スペイン語',
    'fr-FR': 'フランス語',
    'de-DE': 'ドイツ語',
    'ja-JP': '日本語',
    'ko-KR': '韓国語',
    'pt-PT': 'ポルトガル語',
    'ru-RU': 'ロシア語',
  },
  'ko-KR': {
    'en-US': '영어',
    'zh-CN': '중국어 간체',
    'zh-TW': '중국어 번체',
    'es-ES': '스페인어',
    'fr-FR': '프랑스어',
    'de-DE': '독일어',
    'ja-JP': '일본어',
    'ko-KR': '한국어',
    'pt-PT': '포르투갈어',
    'ru-RU': '러시아어',
  },
  'pt-PT': {
    'en-US': 'Inglês',
    'zh-CN': 'Chinês simplificado',
    'zh-TW': 'Chinês tradicional',
    'es-ES': 'Espanhol',
    'fr-FR': 'Francês',
    'de-DE': 'Alemão',
    'ja-JP': 'Japonês',
    'ko-KR': 'Coreano',
    'pt-PT': 'Português',
    'ru-RU': 'Russo',
  },
  'ru-RU': {
    'en-US': 'Английский',
    'zh-CN': 'Китайский упрощенный',
    'zh-TW': 'Китайский традиционный',
    'es-ES': 'Испанский',
    'fr-FR': 'Французский',
    'de-DE': 'Немецкий',
    'ja-JP': 'Японский',
    'ko-KR': 'Корейский',
    'pt-PT': 'Португальский',
    'ru-RU': 'Русский',
  },
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const currentLanguage = supportedLanguages.find((language) => language.code === i18n.language)
    ?? supportedLanguages[0]
  const localizedLanguageLabels = languageLabelsByLocale[currentLanguage.code]
    ?? languageLabelsByLocale['en-US']

  function changeLanguage(language: AppLanguage) {
    void i18n.changeLanguage(language)
    if (isLocalizedHomePath(location.pathname)) {
      navigate(getHomePathForLanguage(language), { replace: location.pathname === '/' })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5 px-2.5', className)}
          aria-label={t('common.language')}
        >
          <LanguagesIcon className="size-4" />
          <span className="text-xs font-semibold">{currentLanguage.shortLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {supportedLanguages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => changeLanguage(language.code)}
            className="justify-between"
          >
            <span>{localizedLanguageLabels[language.code]}</span>
            {language.code === currentLanguage.code ? <CheckIcon className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
