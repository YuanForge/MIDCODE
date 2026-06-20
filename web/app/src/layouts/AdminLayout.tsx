import { ConsoleLayout, adminNavItems } from '@/layouts/ConsoleLayout'
import { adminApi, type AdminMe } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

// 每个路由要求的最低权限点（超管跳过检查）
// 未列出的路由对所有已登录管理员可见（如 /admin/dashboard）
const PERMISSION_REQUIRED: Record<string, string> = {
  // 渠道 / 号池
  '/admin/channels':      'channels:read',
  '/admin/key-pools':     'keypools:read',
  '/admin/upstream':      'keypools:read',
  '/admin/vendors':       'settings:vendor',
  // 用户
  '/admin/users':         'users:read',
  '/admin/api-keys':      'users:read',
  // 账单 / 卡密 / 优惠券
  '/admin/billing':       'billing:read',
  '/admin/payments':      'billing:read',
  '/admin/vip-groups':    'billing:read',
  '/admin/coupons':       'billing:read',
  '/admin/cards':         'cards:read',
  // 提现
  '/admin/withdraw':      'withdraw:read',
  // 任务 / 日志
  '/admin/tasks':         'tasks:read',
  '/admin/llm-logs':      'logs:read',
  '/admin/exports':       'billing:export',
  // 审计
  '/admin/audit':         'audit:self',
  // 告警（需要告警配置权限才展示）
  '/admin/alerts':        'tasks:write',
  // OCPC（仅超管或采购）
  '/admin/ocpc':          'settings:write',
  // 系统设置（超管才能访问）
  '/admin/roles':         'settings:write',
  '/admin/settings':      'settings:write',
  '/admin/notifications': 'settings:announce',
}

export function AdminLayout() {
  const { data: me, loading } = useAsync<AdminMe | null>(
    () => adminApi.getAdminMe(),
    null,
  )

  // 加载完成前不渲染导航（避免非超管短暂看到完整菜单）
  const perms: string[] = me?.permissions ?? []
  const isSuperAdmin = perms.includes('*')

  const visibleItems = loading
    ? []  // 加载中：等待权限数据，不展示任何菜单项
    : isSuperAdmin
      ? adminNavItems
      : adminNavItems.filter((item) => {
          const required = PERMISSION_REQUIRED[item.href]
          // 无限制条目（如 dashboard）对所有已登录管理员可见
          return !required || perms.includes(required)
        })

  return (
    <ConsoleLayout
      role="admin"
      items={visibleItems}
    />
  )
}
