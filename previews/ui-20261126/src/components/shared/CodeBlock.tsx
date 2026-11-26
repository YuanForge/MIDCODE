import type { ReactNode } from 'react'

import { CopyButton } from '@/components/shared/CopyButton'
import { cn } from '@/lib/utils'

/**
 * Read-only code / JSON surface. Uses the dedicated code tokens, so it stays a dark panel in both
 * themes (the previous `bg-foreground` inverted into a bright slab in dark mode).
 */
export function CodeBlock({
  code,
  title,
  actions,
  copyable = true,
  copyLabel = '复制',
  wrap = false,
  className,
  bodyClassName,
}: {
  code: string
  title?: ReactNode
  actions?: ReactNode
  copyable?: boolean
  copyLabel?: string
  wrap?: boolean
  className?: string
  bodyClassName?: string
}) {
  const hasBar = Boolean(title || actions || copyable)
  return (
    <div
      data-slot="code-block"
      className={cn('overflow-hidden rounded-lg border border-code-border bg-code text-code-foreground', className)}
    >
      {hasBar ? (
        <div className="flex min-h-10 items-center justify-between gap-2 border-b border-code-border py-1 pr-1.5 pl-4">
          <div className="min-w-0 truncate text-xs font-medium text-code-muted">{title}</div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {copyable ? (
              <CopyButton
                value={code}
                label={copyLabel}
                showLabel
                size="sm"
                className="h-7 px-2 text-xs text-code-muted hover:bg-white/8 hover:text-code-foreground"
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <pre
        className={cn(
          'overflow-auto p-4 font-mono text-[13px] leading-6',
          wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre',
          bodyClassName,
        )}
      >
        {code}
      </pre>
    </div>
  )
}
