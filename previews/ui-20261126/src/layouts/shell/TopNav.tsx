import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SearchIcon } from 'lucide-react'

import { AppLogo } from '@/components/shared/AppLogo'
import { Button } from '@/components/ui/button'
import { useSlidingIndicator } from '@/hooks/use-sliding-indicator'
import type { NavSection } from '@/layouts/nav-config'
import { useBalance } from '@/layouts/shell/useBalance'
import { modKeyLabel } from '@/lib/console-status'
import { formatCredits } from '@/lib/formatters/credits'

const sectionLink =
  'relative z-10 inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm whitespace-nowrap text-muted-foreground outline-none transition-colors duration-140 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 data-[active=true]:bg-foreground data-[active=true]:font-medium data-[active=true]:text-background data-[active=true]:hover:text-background group-data-[indicator=ready]/nav:data-[active=true]:bg-transparent'

/** The balance is the one figure every user page needs, so it rides in the bar and opens the top-up page. */
function BalanceChip() {
  const { t } = useTranslation()
  const balance = useBalance(true)
  return (
    <Link
      to='/billing'
      data-slot='nav-balance'
      title={t('layout.topupTitle')}
      className='hidden h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/5 px-3.5 text-[13px] text-muted-foreground outline-none transition-colors duration-140 hover:bg-foreground/8 focus-visible:ring-3 focus-visible:ring-ring/40 sm:flex'
    >
      <span>{t('layout.balance', { defaultValue: '余额' })}</span>
      <b className='font-semibold text-foreground tabular-nums'>{balance == null ? '—' : formatCredits(balance)}</b>
    </Link>
  )
}

/**
 * The user console's navigation: one glass bar that floats under the top edge. From the left: the brand, the
 * sections (the open one is an ink capsule that travels to the next choice), the command palette trigger, the
 * balance and the account cluster. Below lg the sections move to the bottom tab bar.
 */
export function TopNav({
  homeHref,
  siteName,
  logoUrl,
  sections,
  activeKey,
  activeHref,
  commandLabel,
  onCommand,
  showBalance,
  children,
}: {
  homeHref: string
  siteName: string
  logoUrl?: string
  sections: NavSection[]
  activeKey?: string
  activeHref?: string
  commandLabel: string
  onCommand: () => void
  showBalance: boolean
  children: ReactNode
}) {
  const navRef = useRef<HTMLElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  useSlidingIndicator(navRef, indicatorRef, '[data-active=true]')

  const primary = sections.filter((section) => !section.secondary)
  const secondary = sections.filter((section) => section.secondary)

  const link = (section: NavSection) => {
    const href = section.items[0].href
    const active = section.key === activeKey
    return (
      <Link
        key={section.key}
        to={href}
        data-active={active}
        aria-current={active ? (activeHref === href ? 'page' : 'true') : undefined}
        className={sectionLink}
      >
        {section.label}
      </Link>
    )
  }

  return (
    <header className='sticky top-0 z-30 px-3 pt-3 md:px-5'>
      <div data-slot='top-bar' className='glass flex h-14 items-center gap-2 rounded-full! pr-2 pl-3 md:gap-3 md:pl-4'>
        <Link to={homeHref} aria-label={siteName} className='shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40'>
          <AppLogo siteName={siteName} logoUrl={logoUrl} compact />
        </Link>
        <nav
          ref={navRef}
          aria-label={siteName}
          className='group/nav relative ml-1 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] lg:flex'
        >
          <span
            ref={indicatorRef}
            aria-hidden
            className='pointer-events-none absolute top-0 left-0 hidden rounded-full bg-foreground ease-out group-data-[indicator=ready]/nav:block data-[animate=true]:transition-[translate,width,height] data-[animate=true]:duration-200'
          />
          {primary.map(link)}
          {secondary.length > 0 ? <span aria-hidden className='mx-2 h-4 w-px shrink-0 bg-foreground/15' /> : null}
          {secondary.map(link)}
        </nav>
        <span className='flex-1 lg:hidden' />
        <button
          type='button'
          onClick={onCommand}
          aria-label={commandLabel}
          className='hidden h-9 w-52 shrink-0 items-center gap-2 rounded-full border border-glass-border bg-glass-strong pr-1.5 pl-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground xl:flex'
        >
          <SearchIcon aria-hidden className='size-3.5' />
          <span>{commandLabel}</span>
          <kbd className='ml-auto rounded-full border border-border px-1.5 font-mono text-[11px]'>{modKeyLabel()} K</kbd>
        </button>
        <Button variant='ghost' size='icon-sm' aria-label={commandLabel} onClick={onCommand} className='text-muted-foreground hover:text-foreground xl:hidden'>
          <SearchIcon />
        </Button>
        {showBalance ? <BalanceChip /> : null}
        {children}
      </div>
    </header>
  )
}
