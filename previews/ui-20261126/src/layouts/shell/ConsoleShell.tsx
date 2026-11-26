import { useCallback, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AppLogo } from '@/components/shared/AppLogo'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageIconContext } from '@/components/shared/page-icon-context'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { ADMIN_SECTIONS, USER_SECTIONS, buildSections, type ConsoleRole, type NavGroup, type NavItem, type NavSection } from '@/layouts/nav-config'
import { AccountCluster } from '@/layouts/shell/AccountCluster'
import { CommandPalette } from '@/layouts/shell/CommandPalette'
import { MobileTabs } from '@/layouts/shell/MobileTabs'
import { buildCrumbs, isActivePath, paletteEntries } from '@/layouts/shell/navModel'
import { SectionNav } from '@/layouts/shell/SectionNav'
import { TopBar } from '@/layouts/shell/TopBar'
import { TopNav } from '@/layouts/shell/TopNav'
import { clearRoleToken, getRoleToken } from '@/lib/auth/storage'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { useCommandShortcut } from '@/lib/use-command-shortcut'
import { useRowKeys } from '@/lib/use-row-keys'
import { cn } from '@/lib/utils'

type ConsoleLayoutProps = {
  role: ConsoleRole
  // Flat list (legacy) or grouped navigation
  items?: NavItem[]
  groups?: NavGroup[]
  identity?: {
    label: string
    description: string
  }
  footer?: ReactNode
}

const GENERATION_USER_PATHS = new Set(['/playground', '/creation', '/image-gen', '/video-gen', '/music-gen'])
const HOME: Record<ConsoleRole, string> = {
  user: '/dashboard',
  admin: '/admin/dashboard',
  vendor: '/vendor/dashboard',
  reseller: '/reseller/dashboard',
}
const LOGIN: Record<ConsoleRole, string> = {
  user: '/login',
  admin: '/admin/login',
  vendor: '/vendor/login',
  reseller: '/reseller/login',
}
const CONSOLE_LABEL: Partial<Record<ConsoleRole, string>> = {
  admin: '管理后台',
  vendor: '号商后台',
  reseller: '代理商后台',
}

// The open section is a lighter block on the ink rail.
const RAIL_ITEM =
  'h-10 rounded-2xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground data-active:hover:bg-sidebar-accent'

const RAIL_KEY = 'console_rail'

// Where the rail starts open when the person has not chosen yet. Administrator pages are wide tables, so that
// rail waits for a window that has room for both, and when it folds it leaves the page the whole width.
const RAIL_OPEN_FROM: Record<ConsoleRole, number> = { user: 1100, admin: 1640, vendor: 1100, reseller: 1100 }

/** The rail stays as the person left it. Until they choose, it starts folded to icons on a window too narrow for it. */
function readRailOpen(role: ConsoleRole) {
  if (typeof window === 'undefined') return true
  try {
    const stored = window.localStorage.getItem(RAIL_KEY)
    if (stored) return stored !== 'collapsed'
  } catch {
    // Storage is unavailable: fall through to the width rule.
  }
  return window.matchMedia(`(min-width: ${RAIL_OPEN_FROM[role]}px)`).matches
}

/**
 * Console shell. The two sides are told apart at a glance:
 * - The user console has no side rail. One glass bar floats under the top edge with the brand, the sections,
 *   the command palette, the balance and the account.
 * - The back-office consoles (administrator, vendor, reseller) keep an ink rail that floats on the left as one
 *   island, with one entry per section, and a floating glass bar over the page. The rail folds from its toggle
 *   or Ctrl/Cmd+B and remembers that: to icons, or for the administrator console out of the way entirely.
 * A section with several pages shows them as a switcher above the page. Ctrl/Cmd+K jumps to any page. On phones
 * the first sections sit in a bottom tab bar.
 */
export function ConsoleShell({ role, items = [], groups, identity, footer }: ConsoleLayoutProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { settings } = useSiteSettings()
  const { siteName, logoUrl, headerHtml, footerHtml } = settings
  const [paletteOpen, setPaletteOpen] = useState(false)
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), [])
  const [railOpen, setRailOpen] = useState(() => readRailOpen(role))
  const changeRail = useCallback((open: boolean) => {
    setRailOpen(open)
    try {
      window.localStorage.setItem(RAIL_KEY, open ? 'open' : 'collapsed')
    } catch {
      // Storage is unavailable: the choice lasts for this visit only.
    }
  }, [])
  useCommandShortcut(togglePalette)
  useRowKeys()

  const topNav = role === 'user'
  const isLoggedIn = !!getRoleToken(role)
  const isDocsPage = role === 'user' && location.pathname === '/docs'
  const isGenerationPage = role === 'user' && GENERATION_USER_PATHS.has(location.pathname)

  function text(value: string, key?: string) {
    if (role !== 'user' || !key) return value
    const translated = t(key)
    return translated === key ? value : translated
  }

  // Auth-gated groups stay hidden for guests; labels are translated once here.
  const navItems: NavItem[] = (groups ?? [{ items }])
    .filter((group) => !group.requiresAuth || isLoggedIn)
    .flatMap((group) => group.items)
    .map((item) => ({ ...item, label: text(item.label, item.labelKey) }))

  const sections: NavSection[] =
    role === 'user'
      ? buildSections(USER_SECTIONS.filter((spec) => !spec.requiresAuth || isLoggedIn), navItems, text)
      : role === 'admin'
        ? buildSections(ADMIN_SECTIONS, navItems)
        : navItems.map((item) => ({ key: item.href, label: item.label, icon: item.icon, items: [item] }))

  const activeItem = navItems
    .filter((item) => isActivePath(location.pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]
  const activeSection = activeItem ? sections.find((section) => section.items.includes(activeItem)) : undefined
  // The rail or the bar already says which console this is, so the trail starts at the section.
  const crumbs = buildCrumbs(role, location.pathname, sections).slice(1)

  const accountName =
    identity?.label ??
    (role === 'admin' ? '管理员' : role === 'vendor' ? 'Vendor' : role === 'reseller' ? 'Reseller' : t('layout.userFallback'))

  function logout() {
    clearRoleToken(role)
    navigate(LOGIN[role])
  }

  const commandLabel = t('console.jump', { defaultValue: '跳转到…' })
  const account = <AccountCluster role={role} displayName={identity?.label} accountName={accountName} onLogout={logout} />

  // User pages are centred under the floating bar; back-office pages use the full width beside the rail.
  const frame = isGenerationPage ? 'w-full px-4 md:px-8' : isDocsPage ? 'w-full px-5 md:px-10' : topNav ? 'mx-auto w-full max-w-[1360px] px-4 md:px-6' : 'w-full px-3 md:px-4'
  const sectionNav =
    activeSection && activeSection.items.length > 1 ? (
      <div className={cn(frame, 'pt-5')}>
        <SectionNav key={activeSection.key} label={activeSection.label} items={activeSection.items} activeHref={activeItem?.href} />
      </div>
    ) : null
  const pageClass = cn(
    topNav ? 'max-w-[1360px] gap-6 px-4 py-5 md:px-6 md:py-6' : 'max-w-none gap-6 px-3 py-5 md:px-4 md:py-5',
    sectionNav && 'pt-4 md:pt-4',
  )

  return (
    <SidebarProvider
      open={topNav ? false : railOpen}
      onOpenChange={topNav ? undefined : changeRail}
      data-slot='app-shell'
      className='console-canvas'
      style={{ '--sidebar-width': '13.75rem' } as CSSProperties}
    >
      {topNav ? null : (
        <Sidebar collapsible={role === 'admin' ? 'offcanvas' : 'icon'} variant='floating' className='dark console-rail'>
          <SidebarHeader className='h-14 justify-center px-3 py-0 group-data-[collapsible=icon]:px-1.5'>
            <Link
              to={HOME[role]}
              aria-label={siteName}
              className='block w-fit max-w-full overflow-hidden rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40 group-data-[collapsible=icon]:w-8'
            >
              <AppLogo siteName={siteName} logoUrl={logoUrl} label={CONSOLE_LABEL[role]} compact />
            </Link>
          </SidebarHeader>
          <SidebarContent className='py-1'>
            <SidebarGroup className='py-1'>
              <SidebarGroupContent>
                <SidebarMenu className='gap-1'>
                  {sections.map((section) => {
                    const href = section.items[0].href
                    const active = section === activeSection
                    return (
                      <SidebarMenuItem key={section.key}>
                        <SidebarMenuButton asChild isActive={active} tooltip={section.label} className={RAIL_ITEM}>
                          <Link to={href} aria-current={active ? (activeItem?.href === href ? 'page' : 'true') : undefined}>
                            <section.icon />
                            <span>{section.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          {footer ? <SidebarFooter className='p-3 group-data-[collapsible=icon]:p-2'>{footer}</SidebarFooter> : null}
        </Sidebar>
      )}
      <SidebarInset>
        {topNav ? (
          <TopNav
            homeHref={HOME[role]}
            siteName={siteName}
            logoUrl={logoUrl}
            sections={sections}
            activeKey={activeSection?.key}
            activeHref={activeItem?.href}
            commandLabel={commandLabel}
            onCommand={togglePalette}
            showBalance={isLoggedIn}
          >
            {account}
          </TopNav>
        ) : (
          <TopBar
            brand={
              role === 'admin' ? (
                <Link to={HOME[role]} aria-label={siteName} className='shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40'>
                  <AppLogo siteName={siteName} logoUrl={logoUrl} compact />
                </Link>
              ) : undefined
            }
            crumbs={crumbs}
            menuLabel={t('console.menu', { defaultValue: '导航菜单' })}
            breadcrumbLabel={t('console.breadcrumb', { defaultValue: '当前位置' })}
            commandLabel={commandLabel}
            onCommand={togglePalette}
          >
            {account}
          </TopBar>
        )}
        {headerHtml ? (
          <div className='mt-3 border-y border-glass-border bg-glass-strong px-4 py-2 text-sm md:px-6' dangerouslySetInnerHTML={{ __html: sanitizeHtml(headerHtml) }} />
        ) : null}
        <PageIconContext.Provider value={activeItem?.icon ?? null}>
          {sectionNav}
          <div key={location.pathname} className={cn('min-w-0 flex-1 animate-page-enter pb-16', topNav ? 'lg:pb-0' : 'md:pb-0')}>
            {isDocsPage ? (
              <div className='flex w-full flex-col'>
                <Outlet />
              </div>
            ) : isGenerationPage ? (
              <div className={cn('flex w-full flex-col gap-5 px-4 py-5 md:px-8', sectionNav && 'pt-4')}>
                <Outlet />
              </div>
            ) : (
              <PageContainer className={pageClass}>
                <Outlet />
              </PageContainer>
            )}
          </div>
        </PageIconContext.Provider>
        {footerHtml ? (
          <footer className='border-t border-glass-border px-4 py-3 text-xs text-muted-foreground md:px-6' dangerouslySetInnerHTML={{ __html: sanitizeHtml(footerHtml) }} />
        ) : null}
        {sections.length > 0 ? (
          <MobileTabs
            items={sections.map((section) => ({ href: section.items[0].href, label: section.label, icon: section.icon, active: section === activeSection }))}
            label={siteName}
            moreLabel={t('common.more', { defaultValue: '更多' })}
            onMore={topNav ? togglePalette : undefined}
            className={topNav ? 'lg:hidden' : 'md:hidden'}
          />
        ) : null}
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          entries={paletteEntries(sections)}
          title={t('console.paletteTitle', { defaultValue: '命令面板' })}
          placeholder={t('console.palettePlaceholder', { defaultValue: '跳转到页面…' })}
          emptyText={t('console.paletteEmpty', { defaultValue: '没有匹配的页面' })}
          hints={t('console.paletteHints', { defaultValue: '↑↓ 选择   ⏎ 打开   esc 关闭' })}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
