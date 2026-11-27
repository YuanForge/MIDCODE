import { KeySquareIcon, LayoutDashboardIcon, ServerIcon } from 'lucide-react'

import { ConsoleLayout } from '@/layouts/ConsoleLayout'

export function ResellerLayout() {
  return (
    <ConsoleLayout
      role="reseller"
      items={[
        { label: '代理商工作台', href: '/reseller/dashboard', icon: LayoutDashboardIcon },
        { label: 'API Key', href: '/reseller/keys', icon: KeySquareIcon },
        { label: '代理站点', href: '/reseller/sites', icon: ServerIcon },
      ]}
    />
  )
}
