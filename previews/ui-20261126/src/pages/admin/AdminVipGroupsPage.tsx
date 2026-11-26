import { useState } from 'react'
import { PlusIcon, Trash2Icon, UsersRoundIcon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminVIPGroup } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { VipGroupDialog } from '@/pages/admin/vip/VipGroupDialog'
import { cny, discountOf, emptyForm, formFromGroup, payloadFromForm, type VipForm } from '@/pages/admin/vip/vipForm'

/** VIP tiers as a ruled ledger. Editing is a dialog; deleting a tier that still has users says so before it goes ahead. */
export function AdminVipGroupsPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listVipGroups(true)
    return res.groups ?? []
  }, [] as AdminVIPGroup[])

  const [mutError, setMutError] = useState('')
  const [refreshingUsers, setRefreshingUsers] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AdminVIPGroup | null>(null)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<VipForm>(emptyForm)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  function updateField<K extends keyof VipForm>(key: K, value: VipForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openDialog(group?: AdminVIPGroup) {
    setForm(formFromGroup(group))
    setSaveError('')
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    setSaveError('')
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
      setSaveError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function executeDelete() {
    const group = pendingDelete
    if (!group?.id) return
    setMutError('')
    try {
      await adminApi.deleteVipGroup(group.id, (group.user_count ?? 0) > 0)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingDelete(null)
    }
  }

  async function refreshAllUsers() {
    setMutError('')
    setRefreshingUsers(true)
    try {
      await adminApi.refreshAllVipUsers()
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setRefreshingUsers(false)
    }
  }

  const shownError = error || mutError
  const deleteCount = pendingDelete?.user_count ?? 0
  const deleteName = pendingDelete?.name || pendingDelete?.code || ''

  return (
    <>
      <PageHeader
        title='VIP 分组管理'
        description='按累计充值自动划分 VIP 分组，并在计费时对渠道售价应用对应折扣；管理员手动调档后会从当前累计额重新统计升档。'
        actions={
          <>
            <Button variant='outline' onClick={() => void refreshAllUsers()} disabled={refreshingUsers}>
              刷新用户升档
            </Button>
            <Button onClick={() => openDialog()}>
              <PlusIcon data-icon='inline-start' />
              新增等级
            </Button>
          </>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[920px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-24'>分组</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className='w-36 text-right'>储值门槛</TableHead>
              <TableHead className='w-28 text-right'>售价折扣</TableHead>
              <TableHead className='w-24 text-right'>用户数</TableHead>
              <TableHead className='w-24'>状态</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : (
            <TableBody>
              {data.length === 0 ? (
                <TableEmpty cols={7} Icon={UsersRoundIcon} title='暂无 VIP 等级' description='新增等级后，充值达标用户会自动进入对应分组。' />
              ) : (
                data.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className='font-mono text-sm'>{group.code}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{group.name || group.code}</div>
                      {group.description ? <div className='text-xs text-muted-foreground'>{group.description}</div> : null}
                    </TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{cny(group.recharge_threshold)}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{discountOf(group).toFixed(2)}%</TableCell>
                    <TableCell className='text-right tabular-nums'>{group.user_count ?? 0}</TableCell>
                    <TableCell>
                      <StatusBadge tone={group.is_active ? 'success' : 'neutral'}>{group.is_active ? '启用' : '停用'}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-2'>
                        <Button size='sm' variant='outline' onClick={() => openDialog(group)}>
                          编辑
                        </Button>
                        <Button size='sm' variant='outline' className='text-destructive' onClick={() => setPendingDelete(group)}>
                          <Trash2Icon data-icon='inline-start' />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
        <p className='border-t border-glass-border px-4 py-3 text-xs text-muted-foreground'>
          计费公式：实际售价 = 渠道售价 × VIP 折扣。折扣以整数基点保存，后端按 credits 整数计算并向上取整；充值和卡密兑换都会计入自动升档累计。
        </p>
      </div>

      <VipGroupDialog open={open} onOpenChange={setOpen} form={form} onField={updateField} error={saveError} saving={saving} onSubmit={() => void save()} />
      <ConfirmAction
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title='确认删除'
        description={
          deleteCount > 0
            ? `分组“${deleteName}”正在被 ${deleteCount} 个用户使用。确认删除分组并清除这些用户的 VIP 分组吗？`
            : `确认删除分组“${deleteName}”？`
        }
        confirmLabel='确认删除'
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
