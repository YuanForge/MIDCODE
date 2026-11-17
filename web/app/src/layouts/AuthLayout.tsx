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
    <div className="relative min-h-svh bg-muted/30">
      <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
        <LanguageSwitcher /><ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-svh w-full max-w-6xl items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] lg:px-10">
        <section
          className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          aria-label={`${siteName} brand`}
        >
          <AppLogo
            siteName={siteName}
            logoUrl={logoUrl}
            label={adminMode ? a.admin : a.platform}
          />
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-primary">
              {adminMode ? a.operations : a.access}
            </p>
            <p className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {adminMode
                ? a.adminTitle
                : a.headline}
            </p>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
              {adminMode
                ? a.adminDesc
                : a.intro}
            </p>
          </div>
        </section>

        <div className="flex min-w-0 justify-center lg:justify-end">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
