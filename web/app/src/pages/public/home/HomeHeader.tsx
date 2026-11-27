import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AppLogo } from '@/components/shared/AppLogo'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useActiveSection } from '@/hooks/use-active-section'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useScrolled } from '@/hooks/use-scroll'
import { getHomePathForLanguage } from '@/i18n'
import { cn } from '@/lib/utils'

const SECTION_IDS = ['guide', 'features', 'models', 'billing', 'faq'] as const
// Page order. The workflow band is tracked too, so the highlight clears there instead of staying on the previous item.
const TRACKED_IDS = ['guide', 'features', 'models', 'workflow', 'billing', 'faq'] as const

const navItem =
  'relative z-10 rounded-full px-4 py-1.5 font-semibold text-muted-foreground outline-none transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-ring/40 data-[covered=true]:text-background'

/**
 * Sticky header. It is transparent at the top of the page and turns into glass once the page scrolls.
 * In the pill, one highlight slides to the hovered item, or to the section currently on screen.
 */
export function HomeHeader({
  siteName,
  logoUrl,
  signedIn,
}: {
  siteName: string
  logoUrl: string
  signedIn: boolean
}) {
  const { i18n, t } = useTranslation()
  const homePath = getHomePathForLanguage(i18n.language)
  const reduced = useReducedMotion()
  const scrolled = useScrolled()
  const active = useActiveSection(TRACKED_IDS)
  const [hovered, setHovered] = useState<string | null>(null)
  const covered = hovered ?? active
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const navRef = useRef<HTMLElement>(null)

  const labels: Record<(typeof SECTION_IDS)[number], string> = {
    guide: t('common.workflow'),
    features: t('common.features'),
    models: t('common.models'),
    billing: t('home.navBilling'),
    faq: t('home.navFaq'),
  }

  useEffect(() => {
    const indicator = indicatorRef.current
    if (!indicator) return
    const item = covered ? navRef.current?.querySelector<HTMLElement>(`[data-item="${covered}"]`) : null
    if (!item) {
      indicator.style.opacity = '0'
      return
    }
    indicator.style.width = `${item.offsetWidth}px`
    indicator.style.transform = `translateX(${item.offsetLeft}px)`
    indicator.style.opacity = '1'
  }, [covered, i18n.language])

  const goTo = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300',
        scrolled ? 'bg-glass shadow-glass backdrop-blur-lg' : 'bg-transparent',
      )}
    >
      <div className='flex h-16 items-center justify-between gap-4 px-[clamp(1.5rem,4vw,4rem)]'>
        <Link
          to={homePath}
          aria-label={siteName}
          className='rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40'
        >
          <AppLogo siteName={siteName} logoUrl={logoUrl} compact />
        </Link>
        <nav
          ref={navRef}
          aria-label={siteName}
          className='glass relative hidden items-center gap-1 rounded-full! p-1 text-sm lg:flex'
          onMouseLeave={() => setHovered(null)}
        >
          <span
            ref={indicatorRef}
            aria-hidden
            className='absolute inset-y-1 left-0 w-0 rounded-full bg-foreground/90 opacity-0 shadow-sm transition-[transform,width,opacity] duration-500 ease-out'
          />
          {SECTION_IDS.map((id) => (
            <a
              key={id}
              data-item={id}
              href={`#${id}`}
              data-covered={covered === id}
              className={navItem}
              onClick={goTo(id)}
              onMouseEnter={() => setHovered(id)}
              onFocus={() => setHovered(id)}
              onBlur={() => setHovered(null)}
            >
              {labels[id]}
            </a>
          ))}
          <Link
            data-item='docs'
            to='/docs'
            data-covered={covered === 'docs'}
            className={navItem}
            onMouseEnter={() => setHovered('docs')}
            onFocus={() => setHovered('docs')}
            onBlur={() => setHovered(null)}
          >
            {t('common.docs')}
          </Link>
        </nav>
        <div className='flex items-center gap-1'>
          <LanguageSwitcher />
          <ThemeToggle />
          {signedIn ? (
            <Button asChild className='shine ml-1'>
              <Link to='/dashboard'>{t('common.dashboard')}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant='ghost' className='hidden sm:inline-flex'>
                <Link to='/login'>{t('common.login')}</Link>
              </Button>
              <Button asChild className='shine ml-1'>
                <Link to='/register'>{t('common.startUsing')}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
