import { Outlet } from 'react-router-dom'

import { AppLogo } from '@/components/shared/AppLogo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { useSiteSettings } from '@/hooks/use-site-settings'

export function AuthLayout({ adminMode = false }: { adminMode?: boolean } = {}) {
  const { settings } = useSiteSettings()
  const { siteName, logoUrl } = settings

  return (
    <div className="relative min-h-svh bg-muted/30">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-svh w-full max-w-6xl items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] lg:px-10">
        <section
          className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          aria-label={`${siteName} brand`}
        >
          <AppLogo
            siteName={siteName}
            logoUrl={logoUrl}
            label={adminMode ? 'Admin Console' : 'Developer Platform'}
          />
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-primary">
              {adminMode ? 'Operations workspace' : 'Unified AI access'}
            </p>
            <p className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {adminMode
                ? 'Manage the platform with confidence.'
                : 'Build, observe, and scale from one place.'}
            </p>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
              {adminMode
                ? 'Secure access to platform operations, permissions, billing, and system settings.'
                : 'Use one dependable workspace for API access, usage visibility, billing, and generation tools.'}
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
