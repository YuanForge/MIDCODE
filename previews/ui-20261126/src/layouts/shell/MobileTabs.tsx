import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontalIcon } from 'lucide-react'

import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

type Tab = { href: string; label: string; icon: ComponentType<{ className?: string }>; active: boolean }

/**
 * Phone navigation: the first four sections sit in a bottom bar within thumb reach. The last slot opens the rest:
 * the rail as a drawer by default, or whatever `onMore` does (the user console opens the command palette).
 */
export function MobileTabs({
  items,
  label,
  moreLabel,
  onMore,
  className,
}: {
  items: Tab[]
  label: string
  moreLabel: string
  onMore?: () => void
  className?: string
}) {
  const { setOpenMobile } = useSidebar()
  const tabs = items.slice(0, 4)
  const base =
    'flex h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] outline-none transition-colors duration-140 focus-visible:bg-muted active:bg-foreground/5'

  return (
    <nav
      aria-label={label}
      className={cn('glass-bar fixed inset-x-0 bottom-0 z-30 grid border-t border-glass-border pb-[env(safe-area-inset-bottom)]', className)}
      style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          to={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={cn(base, tab.active ? 'text-foreground shadow-[inset_0_2px_0_var(--brand)]' : 'text-muted-foreground')}
        >
          <tab.icon className='size-5' />
          <span className='max-w-full truncate'>{tab.label}</span>
        </Link>
      ))}
      <button type='button' onClick={onMore ?? (() => setOpenMobile(true))} className={cn(base, 'text-muted-foreground')}>
        <MoreHorizontalIcon className='size-5' />
        <span>{moreLabel}</span>
      </button>
    </nav>
  )
}
