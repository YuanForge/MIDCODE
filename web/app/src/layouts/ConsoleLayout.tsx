import {
  BlocksIcon,
  BookOpenIcon,
  BoxesIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  CreditCardIcon,
  FileClockIcon,
  KeySquareIcon,
  LayoutDashboardIcon,
  ListIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  NetworkIcon,
  SettingsIcon,
  ShareIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TicketIcon,
  TrendingUpIcon,
  UserRoundIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletCardsIcon,
  WalletIcon,
} from 'lucide-react'

import type { NavGroup, NavItem } from '@/layouts/nav-config'

// The shell itself lives in shell/ConsoleShell. The navigation data stays here, where the layouts import it from.
export { ConsoleShell as ConsoleLayout } from '@/layouts/shell/ConsoleShell'
export type { NavGroup, NavItem } from '@/layouts/nav-config'

export const userNavGroups: NavGroup[] = [
  {
    items: [
      { label: '数据看板', labelKey: 'layout.navDashboard', href: '/dashboard', icon: LayoutDashboardIcon },
      { label: '模型列表', labelKey: 'layout.navModels', href: '/models', icon: BlocksIcon },
      { label: '调用日志', labelKey: 'layout.navLogs', href: '/llm-logs', icon: FileClockIcon },
      { label: '任务中心', labelKey: 'layout.navTasks', href: '/tasks', icon: ListIcon },
      { label: '使用统计', labelKey: 'layout.navStats', href: '/stats', icon: TrendingUpIcon },
      { label: '接口文档', labelKey: 'layout.navDocs', href: '/docs', icon: BookOpenIcon },
    ],
  },
  {
    label: '在线体验',
    labelKey: 'layout.groupExperience',
    requiresAuth: true,
    items: [
      { label: '文本对话', labelKey: 'layout.navPlayground', href: '/playground', icon: MessageSquareIcon },
      { label: '视频工作台', href: '/video-studio', icon: SparklesIcon },
      { label: '创作中心', labelKey: 'layout.navCreation', href: '/creation', icon: SparklesIcon },
    ],
  },
  {
    label: '账户管理',
    labelKey: 'layout.groupAccount',
    requiresAuth: true,
    items: [
      { label: 'API 密钥', labelKey: 'layout.navKeys', href: '/keys', icon: KeySquareIcon },
      { label: '积分充值', labelKey: 'layout.navBilling', href: '/billing', icon: ShoppingCartIcon },
      { label: '个人中心', labelKey: 'layout.navProfile', href: '/profile', icon: UserRoundIcon },
      { label: '邀请中心', labelKey: 'layout.navInvite', href: '/invite', icon: ShareIcon },
    ],
  },
]

/** @deprecated Use userNavGroups instead */
export const userNavItems: NavItem[] = userNavGroups.flatMap((g) => g.items)

export const adminNavItems: NavItem[] = [
  { label: '数据概览', href: '/admin/dashboard', icon: LayoutDashboardIcon },
  { label: '渠道管理', href: '/admin/channels', icon: NetworkIcon },
  { label: '号池管理', href: '/admin/key-pools', icon: KeySquareIcon },
  { label: '用户管理', href: '/admin/users', icon: UsersIcon },
  { label: 'API Key', href: '/admin/api-keys', icon: KeySquareIcon },
  { label: '机器人密钥', href: '/admin/bot-keys', icon: KeySquareIcon },
  { label: '账单流水', href: '/admin/billing', icon: WalletCardsIcon },
  { label: '充值订单', href: '/admin/payments', icon: CreditCardIcon },
  { label: 'VIP 分组', href: '/admin/vip-groups', icon: UsersRoundIcon },
  { label: '模型分组', href: '/admin/model-groups', icon: BoxesIcon },
  { label: '模型企业', href: '/admin/model-providers', icon: Building2Icon },
  { label: '优惠券', href: '/admin/coupons', icon: TicketIcon },
  { label: '任务中心', href: '/admin/tasks', icon: ListIcon },
  { label: '调用日志', href: '/admin/llm-logs', icon: FileClockIcon },
  { label: '卡密管理', href: '/admin/cards', icon: CreditCardIcon },
  { label: '上游平台', href: '/admin/upstream', icon: NetworkIcon },
  { label: 'OCPC 上报', href: '/admin/ocpc', icon: MegaphoneIcon },
  { label: '号商管理', href: '/admin/vendors', icon: BriefcaseBusinessIcon },
  { label: '代理商管理', href: '/admin/resellers', icon: BriefcaseBusinessIcon },
  { label: '提现管理', href: '/admin/withdraw', icon: WalletIcon },
  { label: '通知中心', href: '/admin/notifications', icon: MessageCircleIcon },
  { label: '灵感库', href: '/admin/inspiration', icon: SparklesIcon },
  { label: '告警中心', href: '/admin/alerts', icon: BlocksIcon },
  { label: '数据导出', href: '/admin/exports', icon: ShareIcon },
  { label: '操作审计', href: '/admin/audit', icon: ShoppingCartIcon },
  { label: '角色权限', href: '/admin/roles', icon: UsersRoundIcon },
  { label: '系统设置', href: '/admin/settings', icon: SettingsIcon },
]
