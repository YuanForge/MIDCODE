import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { isDarkModeEnabled, setDarkMode } from '@/lib/auth/storage'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(isDarkModeEnabled())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn('text-muted-foreground hover:text-foreground', className)}
      aria-pressed={isDark}
      title={isDark ? '切换到浅色' : '切换到深色'}
      onClick={() => {
        const next = !isDark
        const apply = () => {
          // Both updates land inside the transition callback, so the new theme and the new icon are captured together.
          flushSync(() => setIsDark(next))
          setDarkMode(next)
        }
        // Where the browser supports it the two themes cross-fade (see base.css); otherwise, and with reduced motion, the switch is immediate.
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (!still && typeof document.startViewTransition === 'function') document.startViewTransition(apply)
        else apply()
      }}
    >
      {/* The two icons rotate past each other, so the switch reads as one control changing state. */}
      <span className="relative inline-flex size-4 items-center justify-center" aria-hidden>
        <SunIcon
          className={cn(
            'absolute size-4 transition-[opacity,transform] duration-200 ease-out',
            isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0',
          )}
        />
        <MoonIcon
          className={cn(
            'absolute size-4 transition-[opacity,transform] duration-200 ease-out',
            isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100',
          )}
        />
      </span>
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
