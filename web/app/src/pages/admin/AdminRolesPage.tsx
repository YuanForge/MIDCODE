import { useState } from 'react'
import { PlusIcon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShieldIcon, UserCogIcon } from 'lucide-react'
import { adminApi, type AdminRole, type AdminAdminUser } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

// 所有可分配的权限点（与后端 RBAC 约定一致）
const ALL_PERMISSIONS = [
  // 数据概览
  'dashboard:users',           // 今日新增用户 / 提现卡片
  'dashboard:channels',        // 渠道 / 成本 / Key 健康
  'dashboard:revenue',         // 收入 / 成本 / 利润（财务核心）
  'dashboard:trend',           // 趋势曲线 / TOP 榜
  // 渠道管理
  'channels:read',
  'channels:write',
  // 号池管理
  'keypools:read',
  'keypools:write',
  // 用户管理
  'users:read',
  'users:write',               // 重置密码 / 冻结 / 分组 / 风控标签
  'users:recharge',            // 充值 / 赠分（发起申请）
  'users:recharge_approve',    // 充值 / 赠分（审批生效） + 退款审批 + 删除用户
  // 账单流水
  'billing:read',
  'billing:export',
  'billing:adjust',            // 手动补单 / 冲销（需留操作备注）
  // 任务中心
  'tasks:read',
  'tasks:write',               // 告警配置
  // 调用日志
  'logs:read',
  'logs:export',
  // 卡密管理
  'cards:read',
  'cards:write',               // 生成 / 作废 / 导出（财务）
  // 提现管理
  'withdraw:read',
  'withdraw:review',           // 初审（客服）
  'withdraw:approve',          // 复审 + 打款（财务）
  // 系统设置
  'settings:write',            // 基本设置（仅超管分配）
  'settings:payment',          // 支付 / 套餐 / 返佣
  'settings:vendor',           // 号商设置
  'settings:announce',         // 公告 / 联系
  // 审计日志
  'audit:self',                // 查看自己的操作记录
  'audit:all',                 // 查看全部审计日志（仅超管分配）
]

export function AdminRolesPage() {
  const { data: roles, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listRoles()
    return res.roles ?? []
  }, [] as AdminRole[], [])

  const [mutError, setMutError] = useState('')
  const [editing, setEditing] = useState<AdminRole | null>(null)
  const [form, setForm] = useState({ name: '', label: '', permissions: [] as string[] })

  function openCreate() {
    setEditing({})
    setForm({ name: '', label: '', permissions: [] })
    setMutError('')
  }

  function openEdit(r: AdminRole) {
    setEditing(r)
    setForm({ name: r.name ?? '', label: r.label ?? '', permissions: r.permissions ?? [] })
    setMutError('')
  }

  function togglePermission(p: string) {
    setForm(f => {
      const perms = f.permissions.includes(p)
        ? f.permissions.filter(x => x !== p)
        : [...f.permissions, p]
      return { ...f, permissions: perms }
    })
  }

  async function handleSave() {
    setMutError('')
    try {
      if (editing?.id) {
        await adminApi.updateRole(editing.id, { label: form.label, permissions: form.permissions })
      } else {
        await adminApi.createRole({ name: form.name, label: form.label, permissions: form.permissions })
      }
      setEditing(null)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function handleDelete(id: number) {
    setMutError('')
    try {
      await adminApi.deleteRole(id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  // ─── 管理员账号 Tab ───
  const { data: admins, loading: adminsLoading, reload: reloadAdmins } = useAsync(async () => {
    const res = await adminApi.listAdminUsers()
    return res.admins ?? []
  }, [] as AdminAdminUser[], [])

  const [assignTarget, setAssignTarget] = useState<AdminAdminUser | null>(null)
  const [assignRoleIds, setAssignRoleIds] = useState<number[]>([])
  const [assignError, setAssignError] = useState('')

  function openAssign(u: AdminAdminUser) {
    setAssignTarget(u)
    setAssignRoleIds(u.role_ids ?? [])
    setAssignError('')
  }

  function toggleAssignRole(id: number) {
    setAssignRoleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleAssignSave() {
    if (!assignTarget?.id) return
    setAssignError('')
    try {
      await adminApi.setAdminRoles(assignTarget.id, assignRoleIds)
      setAssignTarget(null)
      reloadAdmins()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setAssignError(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="RBAC"
        title="角色权限"
        description="管理内置/自定义角色与管理员账号的角色分配。"
        actions={
          <Button size="sm" onClick={openCreate}>
            <PlusIcon className="mr-1 size-3.5" />新建角色
          </Button>
        }
      />
      {error || mutError ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error ?? mutError)}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="roles">
        <TabsList className="mb-4">
          <TabsTrigger value="roles"><ShieldIcon className="mr-1.5 size-3.5" />角色列表</TabsTrigger>
          <TabsTrigger value="admins"><UserCogIcon className="mr-1.5 size-3.5" />管理员账号</TabsTrigger>
        </TabsList>

        {/* ── 角色列表 Tab ── */}
        <TabsContent value="roles">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>名称（key）</TableHead>
                  <TableHead>显示名称</TableHead>
                  <TableHead>权限</TableHead>
                  <TableHead className="w-20">类型</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              {loading ? <TableSkeleton cols={6} /> : (
                <TableBody>
                  {roles.length === 0 ? (
                    <TableEmpty cols={6} Icon={ShieldIcon} title="暂无角色" description="创建角色以进行权限管理。" />
                  ) : roles.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.id}</TableCell>
                      <TableCell className="font-mono text-sm">{r.name}</TableCell>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(r.permissions ?? []).slice(0, 5).map(p => (
                            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                          ))}
                          {(r.permissions?.length ?? 0) > 5 ? (
                            <Badge variant="outline" className="text-xs">+{(r.permissions?.length ?? 0) - 5}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.is_builtin ? <Badge variant="secondary">内置</Badge> : <Badge variant="outline">自定义</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {!r.is_builtin && r.id != null ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                              <Pencil1Icon className="size-3.5" />编辑
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id!)}>
                              <TrashIcon className="size-3.5" />删除
                            </Button>
                          </div>
                        ) : r.id != null ? (
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>查看权限</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </Card>
        </TabsContent>

        {/* ── 管理员账号 Tab ── */}
        <TabsContent value="admins">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>已分配角色</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              {adminsLoading ? <TableSkeleton cols={5} /> : (
                <TableBody>
                  {admins.length === 0 ? (
                    <TableEmpty cols={5} Icon={UserCogIcon} title="暂无管理员账号" description="在用户管理中将用户角色设置为 admin 后即可在此分配权限角色。" />
                  ) : admins.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.id}</TableCell>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email ?? '—'}</TableCell>
                      <TableCell>
                        {(u.role_names ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {u.role_names!.map(n => (
                              <Badge key={n} variant="outline" className="text-xs">{n}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">未分配角色（超管权限）</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openAssign(u)}>分配角色</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 新建/编辑角色 Dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? '编辑角色' : '新建角色'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing?.id ? (
              <div className="space-y-1.5">
                <Label>名称（唯一 key）</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：finance" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>显示名称</Label>
              <Input value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} placeholder="如：财务" />
            </div>
            <div className="space-y-1.5">
              <Label>权限列表</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(p)}
                      onChange={() => togglePermission(p)}
                      className="size-4 rounded border"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            {mutError ? <p className="text-sm text-destructive">{mutError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分配角色 Dialog */}
      <Dialog open={assignTarget !== null} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>分配角色 — {assignTarget?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {roles.filter(r => r.name !== 'super_admin').map(r => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignRoleIds.includes(r.id!)}
                  onChange={() => toggleAssignRole(r.id!)}
                  className="size-4 rounded border"
                />
                <span className="font-medium">{r.label}</span>
                <span className="text-xs text-muted-foreground font-mono">{r.name}</span>
              </label>
            ))}
            {assignError ? <p className="text-sm text-destructive">{assignError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>取消</Button>
            <Button onClick={handleAssignSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
