import { Outlet } from 'react-router-dom'

import { ThemeToggle } from '@/components/shared/ThemeToggle'

export function AuthLayout({ adminMode: _adminMode = false }: { adminMode?: boolean } = {}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--primary)_10%,transparent)_0%,transparent_50%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--chart-3)_8%,transparent)_0%,transparent_50%),linear-gradient(160deg,color-mix(in_oklab,var(--background)_97%,var(--muted)),var(--background)_55%,color-mix(in_oklab,var(--background)_94%,var(--accent)))]">
      {/* 顶部装饰线 */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="absolute right-5 top-5 sm:right-8">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-5 py-16 sm:px-8">
        <Outlet />
      </div>
    </div>
  )
}
