import { PencilIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminModelProvider } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

type ProviderForm = {
  id?: number
  code: string
  name: string
  sort_order: string
}

type PendingAction = {
  provider: AdminModelProvider
  kind: 'toggle' | 'delete'
}

const emptyForm: ProviderForm = { code: '', name: '', sort_order: '0' }

function hasReferences(provider: AdminModelProvider) {
  return (provider.group_count ?? 0) > 0 || (provider.channel_count ?? 0) > 0
}

function formFromProvider(provider?: AdminModelProvider): ProviderForm {
  if (!provider) return emptyForm
  return {
    id: provider.id,
    code: provider.code ?? '',
    name: provider.name ?? '',
    sort_order: String(provider.sort_order ?? 0),
  }
}

export function AdminModelProvidersPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const response = await adminApi.listModelProviders(true)
    return response.providers ?? []
  }, [] as AdminModelProvider[])
  const [form, setForm] = useState<ProviderForm>(emptyForm)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>()
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)
  const [errorText, setErrorText] = useState('')

  function openEditor(provider?: AdminModelProvider) {
    setForm(formFromProvider(provider))
    setErrorText('')
    setDialogOpen(true)
  }

  async function save() {
    const sortOrder = Number(form.sort_order)
    if (!form.code.trim() || !form.name.trim() || !Number.isInteger(sortOrder) || sortOrder < 0) {
      setErrorText('请填写合法的企业编码、显示名称和非负整数排序。')
      return
    }
    setSaving(true)
    setErrorText('')
    try {
      const payload = { code: form.code, name: form.name, sort_order: sortOrder }
      if (form.id) await adminApi.updateModelProvider(form.id, payload)
      else await adminApi.createModelProvider(payload)
      setDialogOpen(false)
      reload()
    } catch (err) {
      setErrorText(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmAction() {
    const action = pendingAction
    if (!action?.provider.id) return
    setActing(true)
    setErrorText('')
    try {
      if (action.kind === 'delete') {
        await adminApi.deleteModelProvider(action.provider.id)
      } else {
        await adminApi.toggleModelProvider(action.provider.id, action.provider.is_active === false)
      }
      setPendingAction(undefined)
      reload()
    } catch (err) {
      setErrorText(getApiErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const actionProvider = pendingAction?.provider
  const disabling = pendingAction?.kind === 'toggle' && actionProvider?.is_active !== false

  return (
    <>
      <PageHeader
        eyebrow="Routing"
        title="模型企业"
        description="统一维护企业标识、显示名称和路由启用状态。"
        actions={<Button onClick={() => openEditor()}><PlusIcon data-icon="inline-start" />新建企业</Button>}
      />
      {error || errorText ? <Alert variant="destructive"><AlertDescription>{error || errorText}</AlertDescription></Alert> : null}

      <Card className="overflow-hidden">
        <div className="max-w-full overflow-x-auto">
          <Table className="table-fixed sm:min-w-[760px] sm:table-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%] sm:w-auto">显示名称</TableHead>
                <TableHead className="hidden sm:table-cell">企业编码</TableHead>
                <TableHead className="hidden sm:table-cell">分组</TableHead>
                <TableHead className="hidden sm:table-cell">渠道</TableHead>
                <TableHead className="hidden sm:table-cell">排序</TableHead>
                <TableHead className="w-16 sm:w-auto">状态</TableHead>
                <TableHead className="w-28 text-right sm:w-auto">操作</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? <TableSkeleton cols={7} /> : (
              <TableBody>
                {data.map((provider) => {
                  const referenced = hasReferences(provider)
                  return (
                    <TableRow key={provider.id}>
                      <TableCell className="min-w-0 font-medium"><span className="block truncate">{provider.name}</span><span className="block truncate font-mono text-xs text-muted-foreground sm:hidden">{provider.code}</span></TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">{provider.code}</TableCell>
                      <TableCell className="hidden sm:table-cell">{provider.group_count ?? 0}</TableCell>
                      <TableCell className="hidden sm:table-cell">{provider.channel_count ?? 0}</TableCell>
                      <TableCell className="hidden sm:table-cell">{provider.sort_order ?? 0}</TableCell>
                      <TableCell><Badge variant={provider.is_active === false ? 'secondary' : 'default'}>{provider.is_active === false ? '停用' : '启用'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" title="编辑企业" aria-label={`编辑 ${provider.name}`} onClick={() => openEditor(provider)}><PencilIcon /></Button>
                          <Button size="icon-sm" variant="ghost" title={provider.is_active === false ? '启用企业' : '停用企业'} aria-label={`${provider.is_active === false ? '启用' : '停用'} ${provider.name}`} onClick={() => setPendingAction({ provider, kind: 'toggle' })}><PowerIcon /></Button>
                          <Button size="icon-sm" variant="ghost" title={referenced ? `仍有 ${provider.group_count ?? 0} 个分组和 ${provider.channel_count ?? 0} 个渠道引用` : '删除企业'} aria-label={`删除 ${provider.name}`} disabled={hasReferences(provider)} onClick={() => setPendingAction({ provider, kind: 'delete' })}><Trash2Icon /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {data.length === 0 ? <TableEmpty cols={7} title="暂无模型企业" description="创建企业后，模型分组和渠道才能选择归属。" /> : null}
              </TableBody>
            )}
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑企业' : '新建企业'}</DialogTitle>
            <DialogDescription>企业编码将作为稳定标识；产生分组或渠道引用后不能修改。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider-code">企业编码</Label>
              <Input id="provider-code" value={form.code} disabled={Boolean(form.id && hasReferences(data.find((item) => item.id === form.id) ?? {}))} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="openai" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider-name">显示名称</Label>
              <Input id="provider-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="OpenAI" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider-sort">排序</Label>
              <Input id="provider-sort" type="number" min="0" step="1" value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open && !acting) setPendingAction(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.kind === 'delete' ? '删除模型企业' : disabling ? '停用模型企业' : '启用模型企业'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'delete'
                ? `确认删除“${actionProvider?.name ?? ''}”？此操作不可恢复。`
                : disabling
                  ? `该企业关联 ${actionProvider?.group_count ?? 0} 个分组和 ${actionProvider?.channel_count ?? 0} 个渠道。停用后，新请求将立即停止使用该企业；重新启用会恢复原有关系。`
                  : `确认重新启用“${actionProvider?.name ?? ''}”？原有分组、渠道和 API Key 绑定将恢复参与路由。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={acting} onClick={(event) => { event.preventDefault(); void confirmAction() }}>{acting ? '处理中...' : '确认'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
