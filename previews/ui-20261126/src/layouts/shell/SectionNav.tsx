import { useRef } from 'react'
import { Link } from 'react-router-dom'

import { useSlidingIndicator } from '@/hooks/use-sliding-indicator'
import type { NavItem } from '@/layouts/nav-config'
import { cn } from '@/lib/utils'

/**
 * The pages of one section, as a capsule switcher above the page. It keeps the main navigation short: a section
 * such as the call records holds the logs, the tasks and the statistics, and this is how a person moves between
 * them. The ink capsule travels to the page that was chosen.
 */
export function SectionNav({ label, items, activeHref }: { label: string; items: NavItem[]; activeHref?: string }) {
  const listRef = useRef<HTMLElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  useSlidingIndicator(listRef, indicatorRef, '[aria-current=page]')

  return (
    <nav
      ref={listRef}
      aria-label={label}
      data-slot='section-nav'
      className='group/section relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-glass-border bg-glass p-1 backdrop-blur-md [scrollbar-width:none]'
    >
      <span
        ref={indicatorRef}
        aria-hidden
        className='pointer-events-none absolute top-0 left-0 hidden rounded-full bg-foreground/90 shadow-sm ease-out group-data-[indicator=ready]/section:block data-[animate=true]:transition-[translate,width,height] data-[animate=true]:duration-200'
      />
      {items.map((item) => {
        const active = item.href === activeHref
        return (
          <Link
            key={item.href}
            to={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap outline-none transition-colors duration-140 focus-visible:ring-2 focus-visible:ring-ring/50',
              active
                ? 'bg-foreground/90 font-medium text-background group-data-[indicator=ready]/section:bg-transparent'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <item.icon className='size-3.5' />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
