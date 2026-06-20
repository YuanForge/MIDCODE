import { BookOpenIcon } from 'lucide-react'

import { ConsoleLayout, userNavGroups, type NavGroup } from '@/layouts/ConsoleLayout'

function withTutorialNav(groups: NavGroup[]) {
  return groups.map((group, index) => {
    if (index !== 0 || group.items.some((item) => item.href === '/tutorial')) {
      return group
    }

    const docsIndex = group.items.findIndex((item) => item.href === '/docs')
    if (docsIndex < 0) return group

    const items = [...group.items]
    items.splice(docsIndex + 1, 0, {
      label: '新手教程',
      href: '/tutorial',
      icon: BookOpenIcon,
    })

    return {
      ...group,
      items,
    }
  })
}

export function UserLayout() {
  return (
    <ConsoleLayout
      role="user"
      groups={withTutorialNav(userNavGroups)}
    />
  )
}
