import type { NavGroup, NavItem } from '@/layouts/nav-config'

export type Crumb = { label: string; href?: string; mono?: boolean }

export type PaletteEntry = { href: string; label: string; group: string; icon: NavItem['icon'] }

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Every page the person can reach, flattened for the command palette. */
export function paletteEntries(groups: NavGroup[]): PaletteEntry[] {
  return groups.flatMap((group) => group.items.map((item) => ({ href: item.href, label: item.label, group: group.label ?? '', icon: item.icon })))
}

/** role ▸ group ▸ page, then any deeper path segments (an id, a sub-page) as mono crumbs. */
export function buildCrumbs(role: string, pathname: string, groups: NavGroup[]): Crumb[] {
  const crumbs: Crumb[] = [{ label: role, mono: true }]
  let best: { item: NavItem; group: NavGroup } | undefined
  for (const group of groups) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href) && (!best || item.href.length > best.item.href.length)) best = { item, group }
    }
  }
  if (!best) return crumbs
  if (best.group.label) crumbs.push({ label: best.group.label })
  crumbs.push({ label: best.item.label, href: best.item.href })
  for (const segment of pathname.slice(best.item.href.length).split('/').filter(Boolean)) {
    crumbs.push({ label: segment, mono: true })
  }
  return crumbs
}
