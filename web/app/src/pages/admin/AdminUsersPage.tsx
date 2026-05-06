import { useState } from 'react'
import { PlusIcon, SaveIcon, Trash2Icon, UsersIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { adminApi, type AdminUser } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

type DialogMode = 'recharge' | 'password' | 'group' | 'rebate' | 'model_credit' | 'freeze' | 'create' | 'delete' | 'detail' | null

function fmtBalance(user: AdminUser) {
  const raw = user.balance ?? (user.balance_credits !== undefined ? user.balance_credits * 1e6 : undefined)
  if (raw === undefined || raw === null) return '-'
  return `¥${(Number(raw) / 1e6).toFixed(4)}`
}

export function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const response = await adminApi.listUsers(page, pageSize)
    const users = Array.isArray(response) ? response : response.users ?? response.items ?? []
    const total = Array.isArray(response) ? users.length : (response as { total?: number }).total ?? users.length
    return { users, total }
  }, { users: [] as AdminUser[], total: 0 }, [page])

  const [mutError, setMutError] = useState('')
  const [activeUser, setActiveUser] = useState<AdminUser | null>(null)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [value, setValue] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [rebatePct, setRebatePct] = useState('')
  const [modelName, setModelName] = useState('')
  const [freezeReason, setFreezeReason] = useState('')
  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', role: 'user' })

  const error = loadError || mutError

  function openDialog(user: AdminUser, mode: Exclude<DialogMode, null>) {
    setActiveUser(user)
    setDialogMode(mode)
    setValue(mode === 'group' ? (user.group ?? '') : mode === 'recharge' ? '1000000' : '')
    setConfirmPwd('')
    setModelName('')
    setFreezeReason('')
    if (mode === 'rebate') {
      const ratio = user.rebate_ratio
      setRebatePct(ratio != null ? String(parseFloat((ratio * 100).toFixed(2))) : '')
    } else {
      setRebatePct('')
    }
    setMutError('')
  }

  function openDetail(user: AdminUser) {
    setActiveUser(user)
    setDialogMode('detail')
    setMutError('')
  }

  function openCreate() {
    setActiveUser(null)
    setDialogMode('create')
    setCreateForm({ username: '', email: '', password: '', role: 'user' })
    setMutError('')
  }

  async function submitDialog() {
    if (dialogMode === 'create') {
      if (!createForm.username || !createForm.email || !createForm.password) {
        setMutError('请填写所有必填字段')
        return
      }
      setMutError('')
      try {
        await adminApi.createUser(createForm)
        setDialogMode(null)
        reload()
      } catch (err) {
        const { getApiErrorMessage } = await import('@/lib/api/http')
        setMutError(getApiErrorMessage(err))
      }
      return
    }
    if (!activeUser?.id || !dialogMode) return
    if (dialogMode === 'password' && value !== confirmPwd) {
      setMutError('两次密码不一致')
      return
    }
    if (dialogMode === 'freeze') {
      setMutError('')
      try {
        await adminApi.freezeUser(activeUser.id, true, freezeReason)
        setDialogMode(null)
        setActiveUser(null)
        reload()
      } catch (err) {
        const { getApiErrorMessage } = await import('@/lib/api/http')
        setMutError(getApiErrorMessage(err))
      }
      return
    }
    if (dialogMode === 'delete') {
      setMutError('')
      try {
        await adminApi.deleteUser(activeUser.id)
        setDialogMode(null)
        setActiveUser(null)
        reload()
      } catch (err) {
        const { getApiErrorMessage } = await import('@/lib/api/http')
        setMutError(getApiErrorMessage(err))
      }
      return
    }
    setMutError('')
    try {
      if (dialogMode === 'recharge') {
        await adminApi.rechargeUser(activeUser.id, Number(value))
      } else if (dialogMode === 'password') {
        await adminApi.resetUserPassword(activeUser.id, value)
      } else if (dialogMode === 'group') {
        await adminApi.setUserGroup(activeUser.id, value)
      } else if (dialogMode === 'rebate') {
        const ratio = rebatePct === '' ? null : parseFloat(rebatePct) / 100
        await adminApi.setUserRebateRatio(activeUser.id, ratio)
      } else if (dialogMode === 'model_credit') {
        await adminApi.grantModelCredit(activeUser.id, { model_name: modelName, credits: Number(value) })
      }
      setDialogMode(null)
      setActiveUser(null)
      setValue('')
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function toggleAgent(user: AdminUser) {
    if (!user.id) return
    setMutError('')
    const nextRole = user.role === 'agent' ? 'user' : 'agent'
    try {
      await adminApi.setUserRole(user.id, nextRole)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function unfreeze(user: AdminUser) {
    if (!user.id) return
    setMutError('')
    try {
      await adminApi.freezeUser(user.id, false)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  const totalPages = Math.ceil(data.total / pageSize)

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="用户与余额管理"
        description="查看用户注册状态、余额和手动充值情况，用于日常运营支持。"
        actions={
          <div className="flex items-center gap-2">
            {error ? (
              <Button size="sm" variant="outline" onClick={reload}>
                重试
              </Button>
            ) : null}
            <Button size="sm" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              创建用户
            </Button>
          </div>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">会员号</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>手机 / 邮箱</TableHead>
              <TableHead className="w-16">状态</TableHead>
              <TableHead className="w-32">余额（¥）</TableHead>
              <TableHead className="w-40">注册时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : (
            <TableBody>
              {data.users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <UsersIcon className="size-10 text-muted-foreground/40" />
                      <p className="text-sm font-medium">还没有用户</p>
                      <p className="max-w-sm text-xs text-muted-foreground">用户完成注册后会显示在这里。</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.users.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell className="text-muted-foreground">{row.id ?? '-'}</TableCell>
                    <TableCell className="font-medium">{row.username ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{row.email ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={(row.is_active ?? true) ? 'default' : 'destructive'} className="text-xs">
                        {(row.is_active ?? true) ? '正常' : '冻结'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{fmtBalance(row)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => openDetail(row)}>
                          详情
                        </Button>
                        <Button
                          size="sm"
                          variant={(row.is_active ?? true) ? 'outline' : 'default'}
                          onClick={() => (row.is_active ?? true) ? openDialog(row, 'freeze') : unfreeze(row)}
                        >
                          {(row.is_active ?? true) ? '封禁' : '解封'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
        {totalPages > 1 ? (
          <CardContent className="flex items-center justify-between border-t py-3">
            <span className="text-sm text-muted-foreground">共 {data.total} 位用户</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                下一页
              </Button>
            </div>
          </CardContent>
        ) : (
          data.total > 0 ? (
            <CardContent className="border-t py-3">
              <span className="text-sm text-muted-foreground">共 {data.total} 位用户</span>
            </CardContent>
          ) : null
        )}
      </Card>

      {/* 详情弹窗 */}
      <Dialog open={dialogMode === 'detail'} onOpenChange={() => setDialogMode(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>用户详情</DialogTitle>
            <DialogDescription>{activeUser?.username ?? activeUser?.email ?? '-'}</DialogDescription>
          </DialogHeader>
          {activeUser ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="text-muted-foreground">会员号</div><div className="font-mono">{activeUser.id ?? '-'}</div>
                <div className="text-muted-foreground">用户名</div><div>{activeUser.username ?? '-'}</div>
                <div className="text-muted-foreground">邮箱</div><div className="truncate">{activeUser.email ?? '-'}</div>
                <div className="text-muted-foreground">角色</div>
                <div>
                  <Badge variant={activeUser.role === 'admin' ? 'destructive' : 'secondary'} className="text-xs">{activeUser.role ?? '-'}</Badge>
                </div>
                <div className="text-muted-foreground">状态</div>
                <div className="space-y-0.5">
                  <Badge variant={(activeUser.is_active ?? true) ? 'default' : 'destructive'} className="text-xs">
                    {(activeUser.is_active ?? true) ? '正常' : '冻结'}
                  </Badge>
                  {!(activeUser.is_active ?? true) && activeUser.frozen_reason ? (
                    <p className="text-xs text-muted-foreground">{activeUser.frozen_reason}</p>
                  ) : null}
                </div>
                <div className="text-muted-foreground">定价分组</div>
                <div>{activeUser.group || <span className="text-muted-foreground/60">默认</span>}</div>
                <div className="text-muted-foreground">返佣比例</div>
                <div>{activeUser.rebate_ratio != null ? `${(activeUser.rebate_ratio * 100).toFixed(2)}%` : <span className="text-muted-foreground/60">全局默认</span>}</div>
                <div className="text-muted-foreground">余额</div><div className="font-mono">{fmtBalance(activeUser)}</div>
                <div className="text-muted-foreground">邀请人数</div><div>{activeUser.invite_count ?? '-'} 人</div>
                <div className="text-muted-foreground">历史消费</div>
                <div className="font-mono">{activeUser.total_spent != null ? `¥${(Number(activeUser.total_spent) / 1e6).toFixed(4)}` : '-'}</div>
                <div className="text-muted-foreground">注册时间</div>
                <div>{activeUser.created_at ? new Date(activeUser.created_at).toLocaleString('zh-CN') : '-'}</div>
              </div>
              <div className="border-t pt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openDialog(activeUser, 'recharge')}>充值</Button>
                <Button size="sm" variant="outline" onClick={() => openDialog(activeUser, 'model_credit')}>赠积分</Button>
                <Button size="sm" variant="outline" onClick={() => openDialog(activeUser, 'password')}>改密</Button>
                <Button size="sm" variant="outline" onClick={() => openDialog(activeUser, 'group')}>设置分组</Button>
                <Button size="sm" variant="outline" onClick={() => openDialog(activeUser, 'rebate')}>设置返佣</Button>
                <Button
                  size="sm"
                  variant={activeUser.role === 'agent' ? 'secondary' : 'secondary'}
                  onClick={() => { setDialogMode(null); setTimeout(() => toggleAgent(activeUser), 0) }}
                >
                  {activeUser.role === 'agent' ? '取消客服' : '设为客服'}
                </Button>
                <Button
                  size="sm"
                  variant={(activeUser.is_active ?? true) ? 'outline' : 'default'}
                  onClick={() => (activeUser.is_active ?? true) ? openDialog(activeUser, 'freeze') : unfreeze(activeUser)}
                >
                  {(activeUser.is_active ?? true) ? '冻结' : '解冻'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openDialog(activeUser, 'delete')}>
                  <Trash2Icon className="size-3 mr-1" />删除
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 操作弹窗 */}
      <Dialog open={Boolean(dialogMode) && dialogMode !== 'detail'} onOpenChange={() => setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'recharge'
                ? '手动充值'
                : dialogMode === 'password'
                  ? '重置密码'
                  : dialogMode === 'rebate'
                    ? '设置返佣比例'
                    : dialogMode === 'model_credit'
                      ? '赠送专属模型积分'
                      : dialogMode === 'freeze'
                        ? '冻结账户'
                        : dialogMode === 'delete'
                          ? '删除用户'
                          : dialogMode === 'create'
                            ? '创建用户'
                            : '设置定价分组'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? '填写新用户信息，将由管理员直接创建账号（无需邮箱验证）。'
                : `用户：${activeUser?.username ?? activeUser?.email ?? '-'}`}
            </DialogDescription>
          </DialogHeader>
          {mutError ? (
            <Alert variant="destructive">
              <AlertDescription>{mutError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3">
            {dialogMode === 'create' ? (
              <>
                <div className="space-y-1.5">
                  <Label>用户名</Label>
                  <Input value={createForm.username} onChange={(e) => setCreateForm(f => ({ ...f, username: e.target.value }))} placeholder="3-32 位字符" />
                </div>
                <div className="space-y-1.5">
                  <Label>邮箱</Label>
                  <Input type="email" value={createForm.email} onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="唯一，用于登录" />
                </div>
                <div className="space-y-1.5">
                  <Label>密码</Label>
                  <Input type="password" value={createForm.password} onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="至少 8 位" />
                </div>
                <div className="space-y-1.5">
                  <Label>角色</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={createForm.role}
                    onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="user">user（普通用户）</option>
                    <option value="agent">agent（客服）</option>
                    <option value="operator">operator（运营）</option>
                    <option value="admin">admin（管理员）</option>
                  </select>
                </div>
              </>
            ) : dialogMode === 'freeze' ? (
              <div className="space-y-1.5">
                <Label>冻结原因</Label>
                <Input
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  placeholder="请输入冻结原因，用户登录时将看到此信息"
                />
                <p className="text-xs text-muted-foreground">冻结后用户无法登录，其 API Key 也无法使用。</p>
              </div>
            ) : dialogMode === 'delete' ? (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive space-y-1">
                <p className="font-medium">确定要永久删除用户 <strong>{activeUser?.username}</strong> 吗？</p>
                <p>此操作不可恢复，用户的所有 API Key 将同时被删除。</p>
              </div>
            ) : dialogMode === 'model_credit' ? (
              <>
                <div className="space-y-1.5">
                  <Label>模型名称（routing key）</Label>
                  <Input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="如：claude-opus-4-7"
                  />
                  <p className="text-xs text-muted-foreground">填写用户请求时 model 字段的值（渠道展示名或模型名）</p>
                </div>
                <div className="space-y-1.5">
                  <Label>赠送积分数（credits）</Label>
                  <Input
                    value={value}
                    type="text"
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="如：1000000（= ¥1）"
                  />
                  {value ? (
                    <p className="text-xs text-muted-foreground">
                      {Number(value).toLocaleString()} credits = ¥{(Number(value) / 1e6).toFixed(6)}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setValue('1000000')}>¥1</Button>
                  <Button size="sm" variant="outline" onClick={() => setValue('10000000')}>¥10</Button>
                  <Button size="sm" variant="outline" onClick={() => setValue('100000000')}>¥100</Button>
                </div>
              </>
            ) : dialogMode === 'rebate' ? (
              <div className="space-y-1.5">
                <Label>个人返佣比例（%）</Label>
                <Input
                  value={rebatePct}
                  onChange={(event) => setRebatePct(event.target.value)}
                  placeholder="留空=使用全局默认，如：20（代表 20%）"
                />
                <p className="text-xs text-muted-foreground">设置该用户专属的邀请返佣比例，留空则使用系统全局默认值。</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>
                  {dialogMode === 'recharge'
                    ? '充值积分数（credits）'
                    : dialogMode === 'password'
                      ? '新密码'
                      : '分组名称'}
                </Label>
                <Input
                  value={value}
                  type={dialogMode === 'password' ? 'password' : 'text'}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={
                    dialogMode === 'recharge'
                      ? '如：1000000（= ¥1）'
                      : dialogMode === 'password'
                        ? '至少 8 位'
                        : '留空=默认定价，如 vip / premium'
                  }
                />
                {dialogMode === 'recharge' && value ? (
                  <p className="text-xs text-muted-foreground">
                    {Number(value).toLocaleString()} credits = ¥{(Number(value) / 1e6).toFixed(6)}
                  </p>
                ) : null}
                {dialogMode === 'group' ? (
                  <p className="text-xs text-muted-foreground">分组名须与渠道 billing_config.pricing_groups 中的键对应</p>
                ) : null}
              </div>
            )}
            {dialogMode === 'password' ? (
              <div className="space-y-1.5">
                <Label>确认密码</Label>
                <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="再次输入" />
              </div>
            ) : null}
            {dialogMode === 'recharge' ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setValue('1000000')}>¥1</Button>
                <Button size="sm" variant="outline" onClick={() => setValue('10000000')}>¥10</Button>
                <Button size="sm" variant="outline" onClick={() => setValue('100000000')}>¥100</Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              取消
            </Button>
            <Button
              variant={dialogMode === 'delete' ? 'destructive' : 'default'}
              onClick={submitDialog}
            >
              {dialogMode !== 'delete' ? <SaveIcon data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
              {dialogMode === 'delete' ? '确认删除' : dialogMode === 'freeze' ? '确认冻结' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

