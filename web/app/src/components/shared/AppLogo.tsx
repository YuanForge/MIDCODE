import { useState } from 'react'

import { cn } from '@/lib/utils'

export function AppLogo({
  siteName = 'MidCode',
  logoUrl,
  label,
  className,
}: {
  siteName?: string
  logoUrl?: string
  label: string
  className?: string
}) {
  const [erroredUrl, setErroredUrl] = useState<string | undefined>(undefined)
  const initial = (siteName || label || '?').slice(0, 1).toUpperCase()
  const errored = Boolean(logoUrl) && erroredUrl === logoUrl
  const showImage = Boolean(logoUrl) && !errored

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {showImage ? (
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <img
            className="size-full object-contain"
            src={logoUrl}
            alt={`${siteName} logo`}
            onError={() => setErroredUrl(logoUrl)}
          />
        </div>
      ) : logoUrl && errored ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-sm">
          {initial}
        </div>
      ) : (
        <img src="/landing/orbit-mark.png" alt="" className="size-9 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold tracking-tight text-foreground">
          {siteName}
        </p>
        {label !== siteName && <p className="truncate text-xs text-muted-foreground">{label}</p>}
      </div>
    </div>
  )
}
