import { PencilIcon, ShieldIcon, Trash2Icon, UserCogIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminAdminUser, AdminRole } from '@/lib/api/admin'

/** Roles as a ruled ledger. A built-in role can be looked at but not changed or removed. */
export function RolesTable({
  roles,
  loading,
  onEdit,
  onDelete,
}: {
  roles: AdminRole[]
  loading: boolean
  onEdit: (role: AdminRole) => void
  onDelete: (role: AdminRole) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[860px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-16'>ID</TableHead>
            <TableHead>名称（key）</TableHead>
            <TableHead>显示名称</TableHead>
            <TableHead>权限</TableHead>
            <TableHead className='w-24'>类型</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : (
          <TableBody>
            {roles.length === 0 ? (
              <TableEmpty cols={6} Icon={ShieldIcon} title='暂无角色' description='创建角色以进行权限管理。' />
            ) : (
              roles.map((role) => {
                const permissions = role.permissions ?? []
                return (
                  <TableRow key={role.id}>
                    <TableCell className='tabular-nums'>{role.id}</TableCell>
                    <TableCell className='font-mono text-sm'>{role.name}</TableCell>
                    <TableCell className='font-medium'>{role.label}</TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1'>
                        {permissions.slice(0, 5).map((permission) => (
                          <Badge key={permission} variant='outline' className='text-xs'>
                            {permission}
                          </Badge>
                        ))}
                        {permissions.length > 5 ? (
                          <Badge variant='outline' className='text-xs'>
                            +{permissions.length - 5}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{role.is_builtin ? <Badge variant='secondary'>内置</Badge> : <Badge variant='outline'>自定义</Badge>}</TableCell>
                    <TableCell className='text-right'>
                      {role.id == null ? null : role.is_builtin ? (
                        <Button size='sm' variant='outline' onClick={() => onEdit(role)}>
                          查看权限
                        </Button>
                      ) : (
                        <div className='flex justify-end gap-2'>
                          <Button size='sm' variant='outline' onClick={() => onEdit(role)}>
                            <PencilIcon data-icon='inline-start' />
                            编辑
                          </Button>
                          <Button size='sm' variant='outline' className='text-destructive' onClick={() => onDelete(role)}>
                            <Trash2Icon data-icon='inline-start' />
                            删除
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}

/** Admin accounts and the roles each holds. An account with no role is a super admin. */
export function AdminsTable({
  admins,
  loading,
  onAssign,
}: {
  admins: AdminAdminUser[]
  loading: boolean
  onAssign: (admin: AdminAdminUser) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[780px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-16'>ID</TableHead>
            <TableHead>用户名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>已分配角色</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <TableBody>
            {admins.length === 0 ? (
              <TableEmpty cols={5} Icon={UserCogIcon} title='暂无管理员账号' description='在用户管理中将用户角色设置为 admin 后即可在此分配权限角色。' />
            ) : (
              admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className='tabular-nums'>{admin.id}</TableCell>
                  <TableCell className='font-medium'>{admin.username}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>{admin.email ?? '—'}</TableCell>
                  <TableCell>
                    {(admin.role_names ?? []).length > 0 ? (
                      <div className='flex flex-wrap gap-1'>
                        {admin.role_names!.map((name) => (
                          <Badge key={name} variant='outline' className='text-xs'>
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className='text-xs text-muted-foreground'>未分配角色（超管权限）</span>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' onClick={() => onAssign(admin)}>
                      分配角色
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
