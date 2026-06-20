import { PlusIcon, SaveIcon, Trash2Icon, UsersRoundIcon } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { adminApi, type AdminVIPGroup } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

const creditsPerCny = 1_000_000

type VipForm = {
  id?: number
  code: string
  name: string
  recharge_threshold_cny: string
  discount_percent: string
  sort_order: string
  description: string
  is_active: boolean
}

const emptyForm: VipForm = {
  code: '',
  name: '',
  recharge_threshold_cny: '',
  discount_percent: '100',
  sort_order: '0',
  description: '',
  is_active: true,
}

function cny(value?: number) {
  return `¥${((value ?? 0) / creditsPerCny).toFixed(2)}`
}

function formFromGroup(group?: AdminVIPGroup): VipForm {
  if (!group) return emptyForm
  return {
    id: group.id,
    code: group.code ?? '',
    name: group.name ?? '',
    recharge_threshold_cny: String((group.recharge_threshold ?? 0) / creditsPerCny),
    discount_percent: String(group.discount_percent ?? ((group.discount_bps ?? 10000) / 100)),
    sort_order: String(group.sort_order ?? 0),
    description: group.description ?? '',
    is_active: group.is_active ?? true,
  }
}

function payloadFromForm(form: VipForm): Partial<AdminVIPGroup> {
  const threshold = Number(form.recharge_threshold_cny || '0')
  const discountPercent = Number(form.discount_percent || '100')
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    recharge_threshold: Math.round((Number.isFinite(threshold) ? threshold : 0) * creditsPerCny),
    discount_bps: Math.round((Number.isFinite(discountPercent) ? discountPercent : 100) * 100),
    sort_order: Number.parseInt(form.sort_order || '0', 10) || 0,
    description: form.description.trim(),
    is_active: form.is_active,
  }
}

export function AdminVipGroupsPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listVipGroups(true)
    return res.groups ?? []
  }, [] as AdminVIPGroup[])

  const [form, setForm] = useState<VipForm>(emptyForm)
  const [open, setOpen] = useState(false)
  const [mutError, setMutError] = useState('')
  const [refreshingUsers, setRefreshingUsers] = useState(false)

  function openCreate() {
    setForm(emptyForm)
    setMutError('')
    setOpen(true)
  }

  function openEdit(group: AdminVIPGroup) {
    setForm(formFromGroup(group))
    setMutError('')
    setOpen(true)
  }

  async function save() {
    setMutError('')
    try {
      const payload = payloadFromForm(form)
      if (form.id) {
        await adminApi.updateVipGroup(form.id, payload)
      } else {
        await adminApi.createVipGroup(payload)
      }
      setOpen(false)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function remove(group: AdminVIPGroup) {
    if (!group.id) return
    setMutError('')
    try {
      await adminApi.deleteVipGroup(group.id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function refreshAllUsers() {
    setMutError('')
    setRefreshingUsers(true)
    try {
      await adminApi.refreshAllVipUsers()
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    } finally {
      setRefreshingUsers(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="VIP"
        title="VIP 分组管理"
        description="按累计充值自动划分 VIP 分组，并在计费时对渠道售价应用对应折扣；管理员手动调档后会从当前累计额重新统计升档。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refreshAllUsers} disabled={refreshingUsers}>
              刷新用户升档
            </Button>
            <Button size="sm" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              新增等级
            </Button>
          </div>
        }
      />

      {error || mutError ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error ?? mutError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">分组</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="w-36 text-right">储值门槛</TableHead>
              <TableHead className="w-28 text-right">售价折扣</TableHead>
              <TableHead className="w-24 text-right">用户数</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : (
            <TableBody>
              {data.length === 0 ? (
                <TableEmpty cols={7} Icon={UsersRoundIcon} title="暂无 VIP 等级" description="新增等级后，充值达标用户会自动进入对应分组。" />
              ) : data.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-mono text-sm">{group.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{group.name || group.code}</div>
                    {group.description ? <div className="text-xs text-muted-foreground">{group.description}</div> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono">{cny(group.recharge_threshold)}</TableCell>
                  <TableCell className="text-right font-mono">{(group.discount_percent ?? ((group.discount_bps ?? 10000) / 100)).toFixed(2)}%</TableCell>
                  <TableCell className="text-right">{group.user_count ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={group.is_active ? 'default' : 'secondary'}>{group.is_active ? '启用' : '停用'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(group)}>编辑</Button>
                      <Button size="sm" variant="destructive" onClick={() => remove(group)}>
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        <CardContent className="border-t py-3 text-xs text-muted-foreground">
          计费公式：实际售价 = 渠道售价 × VIP 折扣。折扣以整数基点保存，后端按 credits 整数计算并向上取整；充值和卡密兑换都会计入自动升档累计。
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑 VIP 等级' : '新增 VIP 等级'}</DialogTitle>
          </DialogHeader>
          {mutError ? <p className="text-sm text-destructive">{mutError}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>分组标识</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="如 vip1" />
            </div>
            <div className="space-y-1.5">
              <Label>显示名称</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="如 VIP 1" />
            </div>
            <div className="space-y-1.5">
              <Label>累计储值门槛（CNY）</Label>
              <Input type="number" value={form.recharge_threshold_cny} onChange={(e) => setForm((f) => ({ ...f, recharge_threshold_cny: e.target.value }))} placeholder="如 100" />
            </div>
            <div className="space-y-1.5">
              <Label>售价折扣（%）</Label>
              <Input type="number" value={form.discount_percent} onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))} placeholder="如 85" />
            </div>
            <div className="space-y-1.5">
              <Label>排序</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="size-4 rounded border-input"
              />
              启用
            </label>
            <div className="space-y-1.5 md:col-span-2">
              <Label>说明</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="可选，后台备注" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save}>
              <SaveIcon data-icon="inline-start" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
