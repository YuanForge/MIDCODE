import { useEffect, useState } from 'react'
import { BookOpenIcon } from 'lucide-react'

import { ConsoleLayout, userNavGroups, type NavGroup } from '@/layouts/ConsoleLayout'
import { userApi } from '@/lib/api/user'

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
  const [navGroups, setNavGroups] = useState(() => withTutorialNav(userNavGroups))

  useEffect(() => {
    userApi.listChannels().then((res) => {
      const channels = Array.isArray(res) ? res : (res as { channels?: typeof res }).channels ?? []
      const hasVideo = (channels as { type?: string }[]).some((c) => c.type === 'video')
      const hasMusic = (channels as { type?: string }[]).some((c) => c.type === 'music')
      if (!hasVideo || !hasMusic) {
        setNavGroups(withTutorialNav(userNavGroups.map((g) => ({
          ...g,
          items: g.items.filter((item) => {
            if (!hasVideo && item.href === '/video-gen') return false
            if (!hasMusic && item.href === '/music-gen') return false
            return true
          }),
        }))))
      }
    }).catch(() => {/* ignore, show all nav items on error */})
  }, [])

  return (
    <ConsoleLayout
      role="user"
      groups={navGroups}
    />
  )
}
