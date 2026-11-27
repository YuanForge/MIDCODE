import { useState } from 'react'
import { BriefcaseBusinessIcon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminVendor } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { EditVendorDialog } from '@/pages/admin/vendors/EditVendorDialog'
import { formatBalance, formatRatio, isActive, listName, ratioToPercentText, vendorLabel } from '@/pages/admin/vendors/vendorFields'

/** Vendor accounts as a ruled ledger: edit the fee ratio, switch an account on or off after one confirmation. */
export function AdminVendorsPage() {
  const { data: rows, loading, error: loadError, reload } = useAsync(async () => {
    const response = await adminApi.listVendors()
    return Array.isArray(response) ? response : response.items ?? response.vendors ?? []
  }, [] as AdminVendor[])

  const [mutError, setMutError] = useState('')
  const [pendingToggle, setPendingToggle] = useState<AdminVendor | null>(null)

  const [editing, setEditing] = useState<AdminVendor | null>(null)
  const [percent, setPercent] = useState('')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  const error = loadError || mutError
  const toggleAction = pendingToggle == null || isActive(pendingToggle) ? '禁用' : '启用'

  async function executeToggle() {
    if (!pendingToggle?.id) return
    setMutError('')
    try {
      await adminApi.updateVendor(pendingToggle.id, { is_active: !isActive(pendingToggle) })
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingToggle(null)
    }
  }

  function openEdit(row: AdminVendor) {
    setEditing(row)
    setPercent(ratioToPercentText(row))
    setEditError('')
  }

  async function saveVendor() {
    if (!editing?.id) return
    setSaving(true)
    setEditError('')
    try {
      const payload: { commission_ratio?: number; is_active?: boolean } = {}
      if (percent !== '') payload.commission_ratio = parseFloat(percent) / 100
      await adminApi.updateVendor(editing.id, payload)
      setEditing(null)
      reload()
    } catch (err) {
      setEditError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title='号商管理'
        description='管理平台号商账号，支持启停和手续费比例编辑。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[1040px]'>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>注册码</TableHead>
              <TableHead className='text-right'>余额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className='text-right'>佣金/费率</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={9} />
          ) : (
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty
                  cols={9}
                  Icon={BriefcaseBusinessIcon}
                  title='还没有号商'
                  description='号商完成自助注册后会显示在这里，可在此处启停或调整佣金。'
                />
              ) : (
                rows.map((row, index) => {
                  const active = isActive(row)
                  return (
                    <TableRow key={row.id ?? index}>
                      <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                      <TableCell>{listName(row)}</TableCell>
                      <TableCell>{row.email ?? '-'}</TableCell>
                      <TableCell className='font-mono text-xs text-muted-foreground'>{row.invite_code ?? '-'}</TableCell>
                      <TableCell className='text-right font-mono text-[13px]'>{formatBalance(row)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={active ? 'success' : 'neutral'}>{active ? '启用' : '停用'}</StatusBadge>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRatio(row)}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-2'>
                          <Button size='sm' variant='outline' onClick={() => openEdit(row)}>
                            编辑
                          </Button>
                          <Button size='sm' variant='outline' className={active ? 'text-destructive' : undefined} onClick={() => setPendingToggle(row)}>
                            {active ? '禁用' : '启用'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <EditVendorDialog
        vendor={editing}
        percent={percent}
        onPercent={setPercent}
        error={editError}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={() => void saveVendor()}
      />
      <ConfirmAction
        open={pendingToggle != null}
        onClose={() => setPendingToggle(null)}
        title={`确认${toggleAction}`}
        description={`确认${toggleAction}号商「${vendorLabel(pendingToggle)}」吗？`}
        confirmLabel='确认'
        onConfirm={() => void executeToggle()}
      />
    </>
  )
}
