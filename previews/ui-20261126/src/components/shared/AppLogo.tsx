import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Brand lockup: mark + site name, with an optional context label. The site name is rendered once.
 * Without a configured logo the mark is the site initial, set as an ink stamp.
 * `onInk` is still accepted by older callers; the chrome is paper now, so it has no effect.
 */
export function AppLogo({
  siteName = 'MidCode',
  logoUrl,
  label,
  className,
  compact = false,
}: {
  siteName?: string
  logoUrl?: string
  label?: string
  className?: string
  compact?: boolean
  onInk?: boolean
}) {
  const [erroredUrl, setErroredUrl] = useState<string | undefined>(undefined)
  const initial = (siteName || label || '?').trim().slice(0, 1).toUpperCase()
  const errored = Boolean(logoUrl) && erroredUrl === logoUrl
  const showImage = Boolean(logoUrl) && !errored
  const showLabel = Boolean(label) && label !== siteName

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {showImage ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card',
            compact ? 'size-8' : 'size-9',
          )}
        >
          <img
            className='size-full object-contain'
            src={logoUrl}
            alt={`${siteName} logo`}
            onError={() => setErroredUrl(logoUrl)}
          />
        </div>
      ) : (
        <div
          aria-hidden
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md bg-foreground font-semibold text-background',
            compact ? 'size-8 text-sm' : 'size-9 text-[15px]',
          )}
        >
          {initial}
        </div>
      )}
      <div className='flex min-w-0 flex-col'>
        <span className='truncate text-[15px] leading-5 font-semibold tracking-[-0.01em] text-foreground'>{siteName}</span>
        {showLabel ? <span className='truncate text-xs leading-4 text-muted-foreground'>{label}</span> : null}
      </div>
    </div>
  )
}
