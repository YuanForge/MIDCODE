import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AdminUser } from '@/lib/api/admin'
import { UserDetailBody, type UserDetailActions } from '@/pages/admin/users/UserDetailBody'

/** One account in a dialog, for windows too narrow to show it beside the table. An error from here shows in the dialog, where it would otherwise sit behind the overlay. */
export function UserDetailDialog({
  user,
  error,
  onClose,
  onAction,
  onUnfreeze,
  onRefreshVip,
}: {
  user: AdminUser | null
  error: string
  onClose: () => void
} & UserDetailActions) {
  return (
    <Dialog
      open={user != null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>用户详情</DialogTitle>
          <DialogDescription>{user?.username ?? user?.email ?? '-'}</DialogDescription>
        </DialogHeader>
        {user ? <UserDetailBody user={user} error={error} onAction={onAction} onUnfreeze={onUnfreeze} onRefreshVip={onRefreshVip} /> : null}
      </DialogContent>
    </Dialog>
  )
}
