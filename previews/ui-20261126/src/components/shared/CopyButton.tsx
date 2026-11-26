import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

/**
 * Copy action with in-place confirmation: the icon cross-fades to a check for 1.6s, so the
 * result is visible where the user clicked (the toast still fires for screen readers).
 */
export function CopyButton({
  value,
  label = '复制',
  copiedLabel = '已复制',
  successMessage,
  emptyMessage,
  showLabel = false,
  size = 'icon-sm',
  variant = 'ghost',
  className,
  disabled,
}: {
  value: string
  label?: string
  copiedLabel?: string
  successMessage?: string
  emptyMessage?: string
  showLabel?: boolean
  size?: 'icon-sm' | 'icon' | 'sm' | 'default'
  variant?: 'ghost' | 'outline' | 'secondary'
  className?: string
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  function handleCopy(event: React.MouseEvent) {
    event.stopPropagation()
    void copyToClipboard(value, {
      successMessage: successMessage ?? copiedLabel,
      emptyMessage,
      onSuccess: () => {
        setCopied(true)
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setCopied(false), 1600)
      },
    })
  }

  const iconOnly = !showLabel && (size === 'icon-sm' || size === 'icon')

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? size : size === 'icon-sm' || size === 'icon' ? 'sm' : size}
      className={cn(iconOnly && 'text-muted-foreground hover:text-foreground', copied && 'text-success hover:text-success', className)}
      onClick={handleCopy}
      disabled={disabled || !value}
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
      title={iconOnly ? label : undefined}
    >
      <span className="relative inline-flex size-4 items-center justify-center" aria-hidden>
        <CopyIcon
          className={cn(
            'absolute size-3.5 transition-[opacity,transform] duration-150 ease-out',
            copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100',
          )}
        />
        <CheckIcon
          className={cn(
            'absolute size-3.5 transition-[opacity,transform] duration-150 ease-out',
            copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
          )}
          strokeWidth={2.5}
        />
      </span>
      {iconOnly ? null : <span>{copied ? copiedLabel : label}</span>}
    </Button>
  )
}
