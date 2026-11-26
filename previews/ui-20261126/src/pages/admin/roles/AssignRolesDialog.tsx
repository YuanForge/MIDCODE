import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AdminAdminUser, AdminRole } from '@/lib/api/admin'

type Choice = AdminRole & { id: number }

/** Pick which roles an admin account holds. The super admin role is not assignable here. */
export function AssignRolesDialog({
  target,
  roles,
  selected,
  onToggle,
  error,
  saving,
  onClose,
  onSave,
}: {
  target: AdminAdminUser | null
  roles: AdminRole[]
  selected: number[]
  onToggle: (id: number) => void
  error: string
  saving: boolean
  onClose: () => void
  onSave: () => void
}) {
  const choices = roles.filter((role): role is Choice => role.name !== 'super_admin' && typeof role.id === 'number')

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>分配角色 — {target?.username}</DialogTitle>
        </DialogHeader>
        <ul className='max-h-[50vh] divide-y divide-glass-border overflow-y-auto rounded-md border border-glass-border'>
          {choices.length === 0 ? (
            <li className='px-3 py-2 text-sm text-muted-foreground'>暂无可分配的角色。</li>
          ) : (
            choices.map((role) => (
              <li key={role.id}>
                <label className='flex cursor-pointer items-center gap-3 px-3 py-2 text-sm'>
                  <input type='checkbox' className='size-4 accent-primary' checked={selected.includes(role.id)} onChange={() => onToggle(role.id)} />
                  <span className='font-medium'>{role.label}</span>
                  <span className='font-mono text-xs text-muted-foreground'>{role.name}</span>
                </label>
              </li>
            ))
          )}
        </ul>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
