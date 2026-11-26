import { useCallback, useEffect, useRef } from 'react'
import { XIcon } from 'lucide-react'

import { CopyButton } from '@/components/shared/CopyButton'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AdminUser } from '@/lib/api/admin'
import { UserDetailBody, type UserDetailActions } from '@/pages/admin/users/UserDetailBody'
import { isActive } from '@/pages/admin/users/userFormat'

/** The control that opens the account shown here: the row marked as current, and its open button. */
const OPENER = '[data-row][aria-current=true] [data-row-open]'

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
}

/**
 * One account beside the table, for windows wide enough to hold both. The table stays usable, so the next account
 * opens without closing this one first. The head stays in place while the content scrolls inside the panel.
 */
export function UserDetailPanel({ user, error, onClose, onAction, onUnfreeze, onRefreshVip }: { user: AdminUser; error: string; onClose: () => void } & UserDetailActions) {
  const panelRef = useRef<HTMLElement>(null)
  const active = isActive(user)
  const name = user.username ?? user.email ?? '-'

  const close = useCallback(() => {
    // Closing removes whatever had focus in here, so focus first goes back to the row that opened the panel.
    if (panelRef.current?.contains(document.activeElement)) document.querySelector<HTMLElement>(OPENER)?.focus({ preventScroll: true })
    onClose()
  }, [onClose])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A dialog, menu or select on top takes Escape first and marks the event as handled, so only a bare Escape closes the panel.
      if (event.key !== 'Escape' || event.defaultPrevented || isTyping(event.target)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <aside
      ref={panelRef}
      aria-label='用户详情'
      className='glass flex min-w-0 animate-reveal flex-col overflow-hidden 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100dvh-6.5rem)]'
    >
      <header className='flex shrink-0 items-start justify-between gap-3 border-b border-glass-border py-2.5 pr-2.5 pl-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <div className='flex min-w-0 items-center gap-2'>
            <h2 className='min-w-0 truncate text-sm font-bold text-foreground' title={name}>
              {name}
            </h2>
            <StatusBadge tone={active ? 'success' : 'danger'}>{active ? '正常' : '冻结'}</StatusBadge>
          </div>
          <div className='flex items-center gap-1 text-xs text-muted-foreground'>
            <span>UID</span>
            <span className='font-mono text-foreground'>{user.id ?? '-'}</span>
            <CopyButton value={user.id == null ? '' : String(user.id)} label='复制 UID' successMessage='UID 已复制' />
          </div>
        </div>
        <Button variant='ghost' size='icon-sm' aria-label='关闭详情' className='text-muted-foreground hover:text-foreground' onClick={close}>
          <XIcon />
        </Button>
      </header>
      {/* Keyed by account: the next one starts on its first tab, at the top, with nothing typed for the previous one. */}
      <div key={user.id} className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4'>
        <UserDetailBody user={user} error={error} onAction={onAction} onUnfreeze={onUnfreeze} onRefreshVip={onRefreshVip} />
      </div>
    </aside>
  )
}
