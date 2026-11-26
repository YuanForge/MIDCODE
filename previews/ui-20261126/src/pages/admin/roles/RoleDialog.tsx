import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AdminRole } from '@/lib/api/admin'
import { PERMISSION_GROUPS, type RoleForm } from '@/pages/admin/roles/permissions'

/** Create or edit a role. Permissions are grouped by module, with a count of how many are ticked in each. */
export function RoleDialog({
  role,
  form,
  onName,
  onLabel,
  onToggle,
  error,
  saving,
  onClose,
  onSave,
}: {
  role: AdminRole | null
  form: RoleForm
  onName: (next: string) => void
  onLabel: (next: string) => void
  onToggle: (permission: string) => void
  error: string
  saving: boolean
  onClose: () => void
  onSave: () => void
}) {
  const isEdit = Boolean(role?.id)

  return (
    <Dialog
      open={role !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑角色' : '新建角色'}</DialogTitle>
          <DialogDescription>勾选该角色可以使用的功能。</DialogDescription>
        </DialogHeader>
        <div className='flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1'>
          <div className='grid gap-4 sm:grid-cols-2'>
            {!isEdit ? <TextField id='role-name' label='名称（唯一 key）' placeholder='如：finance' value={form.name} onChange={onName} /> : null}
            <TextField id='role-label' label='显示名称' placeholder='如：财务' wide={isEdit} value={form.label} onChange={onLabel} />
          </div>
          {PERMISSION_GROUPS.map((group) => {
            const ticked = group.items.filter((item) => form.permissions.includes(item.key)).length
            return (
              <div key={group.prefix} role='group' aria-labelledby={`perm-${group.prefix}`} className='flex flex-col gap-2 border-t border-glass-border pt-3'>
                <p className='flex items-baseline justify-between text-sm font-medium'>
                  <span id={`perm-${group.prefix}`}>{group.title}</span>
                  <span className='text-xs tabular-nums text-muted-foreground'>
                    {ticked}/{group.items.length}
                  </span>
                </p>
                <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
                  {group.items.map((item) => (
                    <label key={item.key} className='flex cursor-pointer items-center gap-2 text-sm'>
                      <input type='checkbox' className='size-4 accent-primary' checked={form.permissions.includes(item.key)} onChange={() => onToggle(item.key)} />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
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
