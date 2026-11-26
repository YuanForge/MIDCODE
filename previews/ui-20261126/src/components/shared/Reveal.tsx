import type { CSSProperties, ReactNode } from 'react'

import { useInView } from '@/hooks/use-in-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Fades and lifts its children in the first time they scroll into view. `delay` staggers siblings in 90ms steps.
 * With reduced motion the content is shown at once.
 */
export function Reveal({
  delay = 0,
  className,
  style,
  children,
}: {
  delay?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const reduced = useReducedMotion()
  return (
    <div
      ref={ref}
      data-in={inView || reduced}
      className={cn('reveal-up', className)}
      style={{ ...style, '--d': delay } as CSSProperties}
    >
      {children}
    </div>
  )
}
