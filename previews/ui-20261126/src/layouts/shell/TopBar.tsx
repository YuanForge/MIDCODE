import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon, PanelLeftIcon, SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import type { Crumb } from '@/layouts/shell/navModel'
import { modKeyLabel } from '@/lib/console-status'
import { cn } from '@/lib/utils'

/**
 * The bar over the page in the back-office consoles: a glass capsule that floats beside the ink rail. From the
 * left: the rail toggle, the command palette trigger, the trail, then the account cluster. The rail, the section
 * switcher and the page heading already say where you are, so on a desktop window the trail shows only for a
 * page below a navigation entry; on a phone it is the page name. A rail that folds out of the way entirely (the
 * administrator console) takes the brand with it, so while it is hidden `brand` shows here.
 */
export function TopBar({
  brand,
  crumbs,
  menuLabel,
  breadcrumbLabel,
  commandLabel,
  onCommand,
  children,
}: {
  brand?: ReactNode
  crumbs: Crumb[]
  menuLabel: string
  breadcrumbLabel: string
  commandLabel: string
  onCommand: () => void
  children: ReactNode
}) {
  const { toggleSidebar, open } = useSidebar()

  return (
    <header className='sticky top-0 z-30 px-3 pt-3 md:px-4'>
      <div data-slot='top-bar' className='glass flex h-12 items-center gap-2 rounded-full! px-2 md:h-14 md:px-3'>
        <Button variant='ghost' size='icon-sm' aria-label={menuLabel} onClick={toggleSidebar} className='text-muted-foreground hover:text-foreground'>
          <PanelLeftIcon />
        </Button>
        {brand && !open ? <span className='hidden shrink-0 sm:block'>{brand}</span> : null}
        <button
          type='button'
          onClick={onCommand}
          aria-label={commandLabel}
          className='hidden h-9 w-64 shrink-0 items-center gap-2 rounded-full border border-glass-border bg-glass-strong pr-1.5 pl-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground md:flex lg:w-80'
        >
          <SearchIcon aria-hidden className='size-3.5' />
          <span>{commandLabel}</span>
          <kbd className='ml-auto rounded-full border border-border px-1.5 font-mono text-[11px]'>{modKeyLabel()} K</kbd>
        </button>
        <nav aria-label={breadcrumbLabel} className='min-w-0 flex-1'>
          <ol className={cn('flex min-w-0 items-center gap-1 text-[13px]', crumbs.length < 3 && 'md:hidden')}>
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1
              return (
                <li key={`${i}-${crumb.label}`} className={cn('flex min-w-0 items-center gap-1', !last && 'hidden sm:flex')}>
                  {i > 0 ? <ChevronRightIcon aria-hidden className='size-3 shrink-0 text-faint' /> : null}
                  {crumb.href && !last ? (
                    <Link to={crumb.href} className='truncate text-muted-foreground hover:text-foreground'>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? 'page' : undefined} className={cn('truncate', crumb.mono && 'font-mono text-xs', last ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {crumb.label}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
        <Button variant='ghost' size='icon-sm' aria-label={commandLabel} onClick={onCommand} className='text-muted-foreground hover:text-foreground md:hidden'>
          <SearchIcon />
        </Button>
        {children}
      </div>
    </header>
  )
}
