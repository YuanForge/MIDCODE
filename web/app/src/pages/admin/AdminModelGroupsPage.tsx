import { useMemo, useState } from 'react'
import { PlusIcon, PowerIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannel, type AdminModelGroup, type AdminModelGroupModel, type AdminModelProvider } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { BindingsEditor } from '@/pages/admin/groups/BindingsEditor'
import { channelModel, emptyForm, formFromGroup, type GroupForm, type ModelOption } from '@/pages/admin/groups/groupForm'

type Pending = { group: AdminModelGroup; kind: 'delete' | 'disable' }

/** Model groups: a ruled list on the left, the selected group's form and its model bindings on the right. Stopping or deleting a group asks first. */
export function AdminModelGroupsPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [groupsResponse, channelsResponse, providersResponse] = await Promise.all([
      adminApi.listModelGroups(true),
      adminApi.listChannels(),
      adminApi.listModelProviders(true),
    ])
    return {
      groups: groupsResponse.groups ?? [],
      channels: Array.isArray(channelsResponse) ? channelsResponse : channelsResponse.channels ?? [],
      providers: providersResponse.providers ?? [],
    }
  }, { groups: [] as AdminModelGroup[], channels: [] as AdminChannel[], providers: [] as AdminModelProvider[] })

  const [form, setForm] = useState<GroupForm>(emptyForm)
  const [selectedGroupID, setSelectedGroupID] = useState<number>()
  const [bindings, setBindings] = useState<AdminModelGroupModel[]>([])
  const [selectedModelChannels, setSelectedModelChannels] = useState<Record<string, string>>({})
  const [listError, setListError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingGroupID, setTogglingGroupID] = useState<number>()
  const [pending, setPending] = useState<Pending | null>(null)

  const modelOptions = useMemo<ModelOption[]>(() => {
    const grouped = new Map<string, AdminChannel[]>()
    for (const channel of data.channels) {
      const model = channelModel(channel)
      const isBound = bindings.some((binding) => binding.channel_id === channel.id)
      if (!channel.id || !model || (channel.is_active === false && !isBound)) continue
      if ((!form.model_provider_id || channel.model_provider_id !== form.model_provider_id) && !isBound) continue
      const options = grouped.get(model) ?? []
      options.push(channel)
      grouped.set(model, options)
    }
    for (const binding of bindings) {
      const model = binding.routing_model?.trim()
      const channel = binding.channel ?? data.channels.find((item) => item.id === binding.channel_id)
      if (!model || !channel?.id) continue
      const options = grouped.get(model) ?? []
      if (!options.some((item) => item.id === channel.id)) options.push(channel)
      grouped.set(model, options)
    }
    return [...grouped.entries()]
      .map(([model, channels]) => ({ model, channels: channels.sort((left, right) => (left.id ?? 0) - (right.id ?? 0)) }))
      .sort((left, right) => left.model.localeCompare(right.model))
  }, [bindings, data.channels, form.model_provider_id])

  const selectedProvider = data.providers.find((provider) => provider.id === form.model_provider_id)
  const selectedProviderInactive = Boolean(selectedProvider && selectedProvider.is_active === false)
  const selectedGroup = data.groups.find((group) => group.id === form.id)
  const providerLocked = Boolean(form.id && Math.max(selectedGroup?.model_count ?? 0, bindings.length) > 0)
  const shownError = error || listError

  async function loadBindings(groupID: number) {
    const response = await adminApi.listModelGroupModels(groupID)
    const loaded = response.models ?? []
    setBindings(loaded)
    setSelectedModelChannels(Object.fromEntries(loaded.map((binding) => [binding.routing_model, String(binding.channel_id)])))
  }

  function edit(group?: AdminModelGroup) {
    setForm(formFromGroup(group))
    setSaveError('')
    if (group?.id) {
      setSelectedGroupID(group.id)
      void loadBindings(group.id).catch((err) => setSaveError(getApiErrorMessage(err)))
    } else {
      setSelectedGroupID(undefined)
      setBindings([])
      setSelectedModelChannels({})
    }
  }

  async function runDelete(group: AdminModelGroup) {
    if (!group.id) return
    setListError('')
    try {
      await adminApi.deleteModelGroup(group.id)
      if (selectedGroupID === group.id) edit()
      reload()
    } catch (err) {
      setListError(getApiErrorMessage(err))
    }
  }

  async function runToggle(group: AdminModelGroup) {
    if (!group.id) return
    const nextActive = group.is_active === false
    setTogglingGroupID(group.id)
    setListError('')
    try {
      await adminApi.toggleModelGroup(group.id, nextActive)
      if (selectedGroupID === group.id) {
        setForm((current) => (current.id === group.id ? { ...current, is_active: nextActive } : current))
      }
      reload()
    } catch (err) {
      setListError(getApiErrorMessage(err))
    } finally {
      setTogglingGroupID(undefined)
    }
  }

  function toggle(group: AdminModelGroup) {
    if (group.is_active === false) void runToggle(group)
    else setPending({ group, kind: 'disable' })
  }

  async function executePending() {
    const action = pending
    if (!action) return
    if (action.kind === 'delete') await runDelete(action.group)
    else await runToggle(action.group)
  }

  async function replaceModelBindings(groupID: number) {
    const desiredMap = new Map(Object.entries(selectedModelChannels).map(([model, channelID]) => [model, Number(channelID)]))
    const currentMap = new Map(bindings.map((binding) => [binding.routing_model, binding]))
    for (const binding of bindings) {
      if (desiredMap.get(binding.routing_model ?? '') !== binding.channel_id && binding.id) await adminApi.unbindModelGroupModel(groupID, binding.id)
    }
    for (const [model, channelID] of desiredMap) {
      if (currentMap.get(model)?.channel_id !== channelID) await adminApi.bindModelGroupModel(groupID, { channel_id: channelID, routing_model: model })
    }
  }

  async function save() {
    if (Object.values(selectedModelChannels).some((channelID) => !channelID)) {
      setSaveError('已选模型中还有未选择渠道的项目')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      let groupID = form.id
      if (groupID) {
        await adminApi.updateModelGroup(groupID, form)
      } else {
        const savedGroup = await adminApi.createModelGroup(form)
        if (!savedGroup.id) throw new Error('创建分组后未返回分组 ID')
        groupID = savedGroup.id
        setForm((current) => ({ ...current, id: groupID }))
        setSelectedGroupID(groupID)
      }
      await replaceModelBindings(groupID)
      await loadBindings(groupID)
      toast.success('已保存')
      reload()
    } catch (err) {
      setSaveError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const pendingName = pending?.group.name || pending?.group.code || ''

  return (
    <>
      <PageHeader
        title='模型分组'
        description='每个分组内同名模型只能绑定一个渠道；API Key 可以按顺序绑定多个分组。'
        actions={
          <Button onClick={() => edit()}>
            <PlusIcon data-icon='inline-start' />
            新建分组
          </Button>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <div className='grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]'>
        <div className='glass overflow-hidden'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>编码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead className='text-right'>模型数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className='text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton cols={5} />
            ) : (
              <TableBody>
                {data.groups.length === 0 ? (
                  <TableEmpty cols={5} title='暂无模型分组' description='点击右上角「新建分组」创建第一个分组。' />
                ) : (
                  data.groups.map((group) => (
                    <TableRow key={group.id} data-state={selectedGroupID === group.id ? 'selected' : undefined} className='cursor-pointer' onClick={() => edit(group)}>
                      <TableCell className='font-mono'>{group.code}</TableCell>
                      <TableCell className="max-w-48"><div className="flex max-w-48 min-w-0 flex-col items-start gap-1"><span className="w-full truncate" title={group.name}>{group.name}</span><Badge variant="outline" className="max-w-full truncate" title={group.model_provider || '待配置'}>{group.model_provider || '待配置'}</Badge></div></TableCell>
                      <TableCell className='text-right tabular-nums'>{group.model_count ?? 0}</TableCell>
                      <TableCell>
                        <StatusBadge tone={group.is_active === false ? 'neutral' : 'success'}>{group.is_active === false ? '停用' : '启用'}</StatusBadge>
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-1'>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={(event) => {
                              event.stopPropagation()
                              edit(group)
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            disabled={togglingGroupID === group.id}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggle(group)
                            }}
                          >
                            <PowerIcon data-icon='inline-start' />
                            {togglingGroupID === group.id ? '处理中...' : group.is_active === false ? '启用' : '停用'}
                          </Button>
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            className='text-destructive'
                            aria-label={`删除 ${group.name || group.code}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setPending({ group, kind: 'delete' })
                            }}
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

        <section aria-label='分组编辑' className='glass flex flex-col gap-5 p-5'>
          <h2 className='text-sm font-medium'>{form.id ? `编辑分组 · ${form.code}` : '新建分组'}</h2>
          <div className='grid gap-4 sm:grid-cols-2'>
            <TextField id='group-code' label='分组编码' placeholder='standard' value={form.code} onChange={(next) => setForm((current) => ({ ...current, code: next }))} />
            <TextField id='group-name' label='分组名称' placeholder='标准组' value={form.name} onChange={(next) => setForm((current) => ({ ...current, name: next }))} />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor="group-model-provider">模型企业</Label>
            <NativeSelect id="group-model-provider" disabled={providerLocked} value={String(form.model_provider_id || '')} onChange={(event) => setForm((current) => ({ ...current, model_provider_id: Number(event.target.value) }))}>
              <option value="">请选择企业</option>
              {data.providers
                .filter((provider) => provider.is_active !== false || (Boolean(form.id) && provider.id === form.model_provider_id))
                .map((provider) => (
                  <option key={provider.id} value={provider.id} disabled={provider.is_active === false}>
                    {provider.name}
                    {provider.is_active === false ? '（已停用）' : ''}
                  </option>
                ))}
            </NativeSelect>
            {providerLocked ? <p className='text-xs text-muted-foreground'>已有模型绑定，需先清空绑定才能更换企业。</p> : null}
          </div>
          <TextField id='group-description' label='描述' value={form.description} onChange={(next) => setForm((current) => ({ ...current, description: next }))} />
          <BindingsEditor
            options={modelOptions}
            selected={selectedModelChannels}
            onSelected={setSelectedModelChannels}
            providerChosen={Boolean(form.model_provider_id)}
            providerInactive={selectedProviderInactive}
          />
          {saveError ? (
            <Alert variant='destructive'>
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          ) : null}
          <div className='flex justify-end'>
            <Button onClick={() => void save()} disabled={saving}>
              <SaveIcon data-icon='inline-start' />
              {saving ? '保存中...' : form.id ? '保存修改' : '创建并保存'}
            </Button>
          </div>
        </section>
      </div>

      <ConfirmAction
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.kind === 'delete' ? '确认删除' : '确认停用'}
        description={pending?.kind === 'delete' ? `确认删除分组“${pendingName}”？` : `确认停用分组“${pendingName}”？停用后新请求将立即停止使用该分组。`}
        confirmLabel={pending?.kind === 'delete' ? '确认删除' : '确认停用'}
        onConfirm={() => void executePending()}
      />
    </>
  )
}
