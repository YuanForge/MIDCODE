import { useState } from 'react'
import { PlusIcon, ShieldIcon, UserCogIcon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminAdminUser, type AdminRole } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { AssignRolesDialog } from '@/pages/admin/roles/AssignRolesDialog'
import { RoleDialog } from '@/pages/admin/roles/RoleDialog'
import { AdminsTable, RolesTable } from '@/pages/admin/roles/RoleTables'
import { emptyRoleForm, type RoleForm } from '@/pages/admin/roles/permissions'

/** Roles and the admin accounts that hold them. Creating, editing and assigning are dialogs; deleting asks first. */
export function AdminRolesPage() {
  const { data: roles, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listRoles()
    return res.roles ?? []
  }, [] as AdminRole[], [])
  const { data: admins, loading: adminsLoading, error: adminsError, reload: reloadAdmins } = useAsync(async () => {
    const res = await adminApi.listAdminUsers()
    return res.admins ?? []
  }, [] as AdminAdminUser[], [])

  const [mutError, setMutError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AdminRole | null>(null)

  const [editing, setEditing] = useState<AdminRole | null>(null)
  const [form, setForm] = useState<RoleForm>(emptyRoleForm)
  const [roleError, setRoleError] = useState('')
  const [savingRole, setSavingRole] = useState(false)

  const [assignTarget, setAssignTarget] = useState<AdminAdminUser | null>(null)
  const [assignRoleIds, setAssignRoleIds] = useState<number[]>([])
  const [assignError, setAssignError] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  function openCreate() {
    setEditing({})
    setForm(emptyRoleForm)
    setRoleError('')
  }

  function openEdit(role: AdminRole) {
    setEditing(role)
    setForm({ name: role.name ?? '', label: role.label ?? '', permissions: role.permissions ?? [] })
    setRoleError('')
  }

  function togglePermission(permission: string) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }))
  }

  async function saveRole() {
    setSavingRole(true)
    setRoleError('')
    try {
      if (editing?.id) {
        await adminApi.updateRole(editing.id, { label: form.label, permissions: form.permissions })
      } else {
        await adminApi.createRole({ name: form.name, label: form.label, permissions: form.permissions })
      }
      setEditing(null)
      reload()
    } catch (err) {
      setRoleError(getApiErrorMessage(err))
    } finally {
      setSavingRole(false)
    }
  }

  async function executeDelete() {
    const target = pendingDelete
    if (target?.id == null) return
    setMutError('')
    try {
      await adminApi.deleteRole(target.id)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingDelete(null)
    }
  }

  function openAssign(admin: AdminAdminUser) {
    setAssignTarget(admin)
    setAssignRoleIds(admin.role_ids ?? [])
    setAssignError('')
  }

  function toggleAssignRole(id: number) {
    setAssignRoleIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function saveAssign() {
    if (!assignTarget?.id) return
    setSavingAssign(true)
    setAssignError('')
    try {
      await adminApi.setAdminRoles(assignTarget.id, assignRoleIds)
      setAssignTarget(null)
      reloadAdmins()
    } catch (err) {
      setAssignError(getApiErrorMessage(err))
    } finally {
      setSavingAssign(false)
    }
  }

  const shownError = error || adminsError || mutError

  return (
    <>
      <PageHeader
        title='角色权限'
        description='管理内置/自定义角色与管理员账号的角色分配。'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            新建角色
          </Button>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue='roles'>
        <TabsList className='mb-4'>
          <TabsTrigger value='roles'>
            <ShieldIcon className='mr-1.5 size-3.5' />
            角色列表
          </TabsTrigger>
          <TabsTrigger value='admins'>
            <UserCogIcon className='mr-1.5 size-3.5' />
            管理员账号
          </TabsTrigger>
        </TabsList>
        <TabsContent value='roles'>
          <RolesTable roles={roles} loading={loading} onEdit={openEdit} onDelete={setPendingDelete} />
        </TabsContent>
        <TabsContent value='admins'>
          <AdminsTable admins={admins} loading={adminsLoading} onAssign={openAssign} />
        </TabsContent>
      </Tabs>

      <RoleDialog
        role={editing}
        form={form}
        onName={(next) => setForm((current) => ({ ...current, name: next }))}
        onLabel={(next) => setForm((current) => ({ ...current, label: next }))}
        onToggle={togglePermission}
        error={roleError}
        saving={savingRole}
        onClose={() => setEditing(null)}
        onSave={() => void saveRole()}
      />
      <AssignRolesDialog
        target={assignTarget}
        roles={roles}
        selected={assignRoleIds}
        onToggle={toggleAssignRole}
        error={assignError}
        saving={savingAssign}
        onClose={() => setAssignTarget(null)}
        onSave={() => void saveAssign()}
      />
      <ConfirmAction
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title='确认删除'
        description={`确认删除角色「${pendingDelete?.label || pendingDelete?.name || ''}」吗？此操作无法撤销。`}
        confirmLabel='确认删除'
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
