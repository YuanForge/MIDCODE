import type { ComponentType } from 'react'
import { FileClockIcon, LayoutDashboardIcon, NetworkIcon, SettingsIcon, UsersIcon, WalletCardsIcon } from 'lucide-react'

export type ConsoleRole = 'user' | 'admin' | 'vendor' | 'reseller'

type Icon = ComponentType<{ className?: string }>

export type NavItem = {
  label: string
  labelKey?: string
  href: string
  icon: Icon
}

export type NavGroup = {
  label?: string
  labelKey?: string
  items: NavItem[]
  requiresAuth?: boolean
}

/** One entry of the main navigation. A section with several pages shows them as a switcher above the page. */
export type NavSection = {
  key: string
  label: string
  icon: Icon
  items: NavItem[]
  /** Shown after a divider: places to try things and to read, rather than the account's own records. */
  secondary?: boolean
}

export type SectionSpec = {
  key: string
  label: string
  labelKey?: string
  icon?: Icon
  hrefs: string[]
  secondary?: boolean
  requiresAuth?: boolean
}

// The user console has seven sections. Their names reuse navigation names that are already translated,
// so every language keeps a complete bar.
export const USER_SECTIONS: SectionSpec[] = [
  { key: 'overview', label: '数据看板', labelKey: 'layout.navDashboard', hrefs: ['/dashboard'] },
  { key: 'models', label: '模型列表', labelKey: 'layout.navModels', hrefs: ['/models'] },
  { key: 'activity', label: '调用日志', labelKey: 'layout.navLogs', hrefs: ['/llm-logs', '/tasks', '/stats'], requiresAuth: true },
  { key: 'keys', label: 'API 密钥', labelKey: 'layout.navKeys', hrefs: ['/keys'] },
  { key: 'account', label: '账户管理', labelKey: 'layout.groupAccount', hrefs: ['/billing', '/invite', '/profile'] },
  { key: 'try', label: '在线体验', labelKey: 'layout.groupExperience', hrefs: ['/playground', '/creation', '/video-studio'], secondary: true },
  { key: 'skills', label: 'Skills 市场', hrefs: ['/skills'], secondary: true, requiresAuth: true },
  { key: 'guide', label: '接口文档', labelKey: 'layout.navDocs', hrefs: ['/docs', '/tutorial'], secondary: true },
]

// The administrator rail has six sections, named for what the operator is doing.
export const ADMIN_SECTIONS: SectionSpec[] = [
  { key: 'workbench', label: '工作台', icon: LayoutDashboardIcon, hrefs: ['/admin/dashboard'] },
  { key: 'channels', label: '渠道', icon: NetworkIcon, hrefs: ['/admin/channels', '/admin/key-pools', '/admin/upstream', '/admin/model-groups', '/admin/model-providers'] },
  { key: 'users', label: '用户', icon: UsersIcon, hrefs: ['/admin/users', '/admin/api-keys', '/admin/vip-groups', '/admin/vendors', '/admin/resellers'] },
  { key: 'money', label: '资金', icon: WalletCardsIcon, hrefs: ['/admin/payments', '/admin/billing', '/admin/withdraw', '/admin/cards', '/admin/coupons'] },
  { key: 'trace', label: '排障', icon: FileClockIcon, hrefs: ['/admin/llm-logs', '/admin/tasks', '/admin/alerts', '/admin/audit', '/admin/exports'] },
  { key: 'site', label: '设置', icon: SettingsIcon, hrefs: ['/admin/settings', '/admin/bot-keys', '/admin/roles', '/admin/notifications', '/admin/skills', '/admin/inspiration', '/admin/ocpc'] },
]

/**
 * Places the pages a person may open into sections. Permission filtering happens upstream: only items that were
 * passed in are placed, a section with no page left disappears, and anything not listed falls into a final section.
 */
export function buildSections(
  specs: SectionSpec[],
  items: NavItem[],
  translate: (label: string, key?: string) => string = (label) => label,
  restLabel = '其他',
): NavSection[] {
  const placed = new Set<string>()
  const sections = specs.flatMap<NavSection>((spec) => {
    const picked = spec.hrefs
      .map((href) => items.find((item) => item.href === href))
      .filter((item): item is NavItem => Boolean(item))
    if (picked.length === 0) return []
    picked.forEach((item) => placed.add(item.href))
    return [{ key: spec.key, label: translate(spec.label, spec.labelKey), icon: spec.icon ?? picked[0].icon, items: picked, secondary: spec.secondary }]
  })
  const rest = items.filter((item) => !placed.has(item.href))
  if (rest.length > 0) sections.push({ key: 'rest', label: restLabel, icon: rest[0].icon, items: rest })
  return sections
}
