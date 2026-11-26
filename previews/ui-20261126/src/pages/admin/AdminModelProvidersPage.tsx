import { useState } from 'react'
import { PencilIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminModelProvider } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { ProviderDialog } from '@/pages/admin/providers/ProviderDialog'
import { buildProviderPayload, emptyForm, formFromProvider, hasReferences, type ProviderForm } from '@/pages/admin/providers/providerForm'

type PendingAction = {
  provider: AdminModelProvider
  kind: 'toggle' | 'delete'
}

/** Model providers as a ruled ledger. Editing is a dialog; switching one off or deleting it asks first, and a provider that is still referenced cannot be deleted. */
export function AdminModelProvidersPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const response = await adminApi.listModelProviders(true)
    return response.providers ?? []
  }, [] as AdminModelProvider[])

  const [mutError, setMutError] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ProviderForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const editingProvider = data.find((item) => item.id === form.id)
  const codeLocked = Boolean(form.id && editingProvider && hasReferences(editingProvider))
  const shownError = error || mutError

  function updateField<K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openEditor(provider?: AdminModelProvider) {
    setForm(formFromProvider(provider))
    setFormError('')
    setDialogOpen(true)
  }

  async function save() {
    const built = buildProviderPayload(form)
    if ('error' in built) {
      setFormError(built.error)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (form.id) await adminApi.updateModelProvider(form.id, built.payload)
      else await adminApi.createModelProvider(built.payload)
      setDialogOpen(false)
      reload()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function executeAction() {
    const action = pendingAction
    if (!action?.provider.id) return
    setMutError('')
    try {
      if (action.kind === 'delete') {
        await adminApi.deleteModelProvider(action.provider.id)
      } else {
        await adminApi.toggleModelProvider(action.provider.id, action.provider.is_active === false)
      }
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  const actionProvider = pendingAction?.provider
  const disabling = pendingAction?.kind === 'toggle' && actionProvider?.is_active !== false
  const confirmTitle = pendingAction?.kind === 'delete' ? '删除模型企业' : disabling ? '停用模型企业' : '启用模型企业'
  const confirmText =
    pendingAction?.kind === 'delete'
      ? `确认删除“${actionProvider?.name ?? ''}”？此操作不可恢复。`
      : disabling
        ? `该企业关联 ${actionProvider?.group_count ?? 0} 个分组和 ${actionProvider?.channel_count ?? 0} 个渠道。停用后，新请求将立即停止使用该企业；重新启用会恢复原有关系。`
        : `确认重新启用“${actionProvider?.name ?? ''}”？原有分组、渠道和 API Key 绑定将恢复参与路由。`

  return (
    <>
      <PageHeader
        title='模型企业'
        description='统一维护企业标识、显示名称和路由启用状态。'
        actions={
          <Button onClick={() => openEditor()}>
            <PlusIcon data-icon='inline-start' />
            新建企业
          </Button>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass max-w-full overflow-x-auto'>
        <Table className='table-fixed sm:min-w-[760px] sm:table-auto'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[45%] sm:w-auto'>显示名称</TableHead>
              <TableHead className='hidden sm:table-cell'>企业编码</TableHead>
              <TableHead className='hidden text-right sm:table-cell'>分组</TableHead>
              <TableHead className='hidden text-right sm:table-cell'>渠道</TableHead>
              <TableHead className='hidden text-right sm:table-cell'>排序</TableHead>
              <TableHead className='w-20 sm:w-auto'>状态</TableHead>
              <TableHead className='w-32 text-right sm:w-auto'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : (
            <TableBody>
              {data.length === 0 ? (
                <TableEmpty cols={7} title='暂无模型企业' description='创建企业后，模型分组和渠道才能选择归属。' />
              ) : (
                data.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell className='min-w-0 font-medium'>
                      <span className='block truncate'>{provider.name}</span>
                      <span className='block truncate font-mono text-xs text-muted-foreground sm:hidden'>{provider.code}</span>
                    </TableCell>
                    <TableCell className='hidden font-mono text-xs sm:table-cell'>{provider.code}</TableCell>
                    <TableCell className='hidden text-right tabular-nums sm:table-cell'>{provider.group_count ?? 0}</TableCell>
                    <TableCell className='hidden text-right tabular-nums sm:table-cell'>{provider.channel_count ?? 0}</TableCell>
                    <TableCell className='hidden text-right tabular-nums sm:table-cell'>{provider.sort_order ?? 0}</TableCell>
                    <TableCell>
                      <StatusBadge tone={provider.is_active === false ? 'neutral' : 'success'}>{provider.is_active === false ? '停用' : '启用'}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-1'>
                        <Button size='icon-sm' variant='ghost' title='编辑企业' aria-label={`编辑 ${provider.name}`} onClick={() => openEditor(provider)}>
                          <PencilIcon />
                        </Button>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          title={provider.is_active === false ? '启用企业' : '停用企业'}
                          aria-label={`${provider.is_active === false ? '启用' : '停用'} ${provider.name}`}
                          onClick={() => setPendingAction({ provider, kind: 'toggle' })}
                        >
                          <PowerIcon />
                        </Button>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          className='text-destructive'
                          title={hasReferences(provider) ? `仍有 ${provider.group_count ?? 0} 个分组和 ${provider.channel_count ?? 0} 个渠道引用` : '删除企业'}
                          aria-label={`删除 ${provider.name}`}
                          disabled={hasReferences(provider)}
                          onClick={() => setPendingAction({ provider, kind: 'delete' })}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <ProviderDialog open={dialogOpen} onOpenChange={setDialogOpen} form={form} onField={updateField} codeLocked={codeLocked} error={formError} saving={saving} onSubmit={() => void save()} />
      <ConfirmAction
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={confirmTitle}
        description={confirmText}
        confirmLabel='确认'
        onConfirm={() => void executeAction()}
      />
    </>
  )
}
