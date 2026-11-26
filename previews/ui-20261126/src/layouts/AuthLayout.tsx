import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRightIcon } from 'lucide-react'

import { AppLogo } from '@/components/shared/AppLogo'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { getHomePathForLanguage } from '@/i18n'
import { cn } from '@/lib/utils'

// The panel holds the forms the auth routes render, so any card they bring is flattened onto it.
const FLATTEN_CARD =
  '[&_[data-slot=card]]:max-w-none [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:shadow-none [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-footer]]:px-0'

/**
 * Sign-in frame: a glass top bar that shows the path as a breadcrumb, one glass panel in the middle on the
 * console canvas, and a glass status line at the foot. The brand sits above the panel; there is no marketing column.
 */
export function AuthLayout({ adminMode = false }: { adminMode?: boolean } = {}) {
  const { i18n, t } = useTranslation()
  const { pathname } = useLocation()
  const { settings } = useSiteSettings()
  const { siteName, logoUrl } = settings
  const homePath = adminMode ? '/admin/login' : getHomePathForLanguage(i18n.language)
  const host = typeof window !== 'undefined' ? window.location.host : ''
  const crumbs = ['auth', ...pathname.split('/').filter(Boolean)]

  return (
    <div className='console-canvas flex min-h-svh flex-col text-foreground'>
      <header className='glass-bar flex h-12 shrink-0 items-center justify-between gap-3 border-b border-glass-border px-4'>
        <nav aria-label='当前位置' className='min-w-0'>
          <ol className='flex min-w-0 items-center gap-1 font-mono text-xs'>
            {crumbs.map((crumb, index) => (
              <li key={`${index}-${crumb}`} className='flex min-w-0 items-center gap-1'>
                {index > 0 ? <ChevronRightIcon aria-hidden className='size-3 shrink-0 text-faint' /> : null}
                <span className={cn('truncate', index === crumbs.length - 1 ? 'text-foreground' : 'text-muted-foreground')}>{crumb}</span>
              </li>
            ))}
          </ol>
        </nav>
        <div className='flex shrink-0 items-center gap-1'>
          {adminMode ? null : <LanguageSwitcher />}
          <ThemeToggle />
        </div>
      </header>

      <main className='flex flex-1 items-center justify-center px-4 py-10'>
        <div className='flex w-full max-w-[420px] animate-page-enter flex-col gap-4'>
          <section aria-label={siteName} className='flex items-center justify-between gap-3'>
            <Link to={homePath} aria-label={siteName} className='rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40'>
              <AppLogo siteName={siteName} logoUrl={logoUrl} label={adminMode ? '管理后台' : undefined} compact />
            </Link>
            <span className='hidden min-w-0 truncate text-xs text-muted-foreground sm:block'>{adminMode ? '平台运营，一处完成' : t('home.headline')}</span>
          </section>
          <div className={cn('glass p-7', FLATTEN_CARD)}>
            <Outlet />
          </div>
          <p className='truncate font-mono text-[11px] text-faint'>
            {adminMode ? '管理后台使用独立权限入口' : `POST /v1/chat/completions · ${t('home.capabilityText')}`}
          </p>
        </div>
      </main>

      <footer className='glass-bar flex h-8 shrink-0 items-center justify-between gap-4 border-t border-glass-border px-4 font-mono text-[11px] text-muted-foreground'>
        <span className='min-w-0 truncate'>auth:{pathname}</span>
        <span className='shrink-0'>{host}</span>
      </footer>
    </div>
  )
}
