import { useAuthCopy } from '@/i18n/auth-copy'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { Outlet } from 'react-router-dom'

import { AppLogo } from '@/components/shared/AppLogo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { useSiteSettings } from '@/hooks/use-site-settings'

export function AuthLayout({ adminMode = false }: { adminMode?: boolean } = {}) {
  const a = useAuthCopy()
  const { settings } = useSiteSettings()
  const { siteName, logoUrl } = settings

  return (
    <div className="auth-surface min-h-svh bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
        <section aria-label={siteName}><AppLogo siteName={siteName} logoUrl={logoUrl} label={adminMode ? a.admin : siteName} /></section>
        <div className="flex items-center gap-2"><LanguageSwitcher /><ThemeToggle /></div>
      </header>
      <main className="auth-layout">
        <div className="auth-art" aria-hidden="true"><img src="/landing/orbit.png" alt="" /></div>
        <div className="auth-form"><Outlet /></div>
      </main>
    </div>
  )
}
