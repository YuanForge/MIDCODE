import { PlusIcon, PowerIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannel, type AdminModelGroup, type AdminModelGroupModel, type AdminModelProvider } from '@/lib/api/admin'

type GroupForm = { id?: number; code: string; name: string; model_provider_id: number; description: string; is_active: boolean }
const emptyForm: GroupForm = { code: '', name: '', model_provider_id: 0, description: '', is_active: true }

function channelModel(channel: AdminChannel) {
  return channel.display_name?.trim() || channel.model?.trim() || channel.name?.trim() || ''
}

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
  const [modelSearch, setModelSearch] = useState('')
  const [errorText, setErrorText] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingGroupID, setTogglingGroupID] = useState<number>()

  const modelOptions = useMemo(() => {
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
    return [...grouped.entries()]
      .map(([model, channels]) => ({ model, channels: channels.sort((left, right) => (left.id ?? 0) - (right.id ?? 0)) }))
      .sort((left, right) => left.model.localeCompare(right.model))
  }, [bindings, data.channels, form.model_provider_id])

  const selectedProvider = data.providers.find((provider) => provider.id === form.model_provider_id)
  const selectedProviderInactive = Boolean(selectedProvider && selectedProvider.is_active === false)
  const selectedGroup = data.groups.find((group) => group.id === form.id)
  const providerLocked = Boolean(form.id && Math.max(selectedGroup?.model_count ?? 0, bindings.length) > 0)

  const visibleModelOptions = useMemo(() => {
    const keyword = modelSearch.trim().toLowerCase()
    return keyword ? modelOptions.filter((item) => item.model.toLowerCase().includes(keyword)) : modelOptions
  }, [modelOptions, modelSearch])

  async function loadBindings(groupID: number) {
    const response = await adminApi.listModelGroupModels(groupID)
    const loaded = response.models ?? []
    setBindings(loaded)
    setSelectedModelChannels(Object.fromEntries(loaded.map((binding) => [binding.routing_model, String(binding.channel_id)])))
  }

  function edit(group?: AdminModelGroup) {
    setForm(group ? { id: group.id, code: group.code ?? '', name: group.name ?? '', model_provider_id: group.model_provider_id ?? 0, description: group.description ?? '', is_active: group.is_active !== false } : emptyForm)
    if (group?.id) {
      setSelectedGroupID(group.id)
      void loadBindings(group.id)
    } else {
      setSelectedGroupID(undefined)
      setBindings([])
      setSelectedModelChannels({})
    }
    setErrorText('')
  }

  async function remove(group: AdminModelGroup) {
    if (!group.id || !window.confirm(`确认删除分组“${group.name || group.code}”？`)) return
    try {
      await adminApi.deleteModelGroup(group.id)
      if (selectedGroupID === group.id) setSelectedGroupID(undefined)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setErrorText(getApiErrorMessage(err))
    }
  }

  async function toggle(group: AdminModelGroup) {
    if (!group.id) return
    const nextActive = group.is_active === false
    if (!nextActive && !window.confirm(`确认停用分组“${group.name || group.code}”？停用后新请求将立即停止使用该分组。`)) return
    setTogglingGroupID(group.id)
    setErrorText('')
    try {
      await adminApi.toggleModelGroup(group.id, nextActive)
      if (selectedGroupID === group.id) {
        setForm((current) => current.id === group.id ? { ...current, is_active: nextActive } : current)
      }
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setErrorText(getApiErrorMessage(err))
    } finally {
      setTogglingGroupID(undefined)
    }
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
      setErrorText('已选模型中还有未选择渠道的项目')
      return
    }
    setSaving(true)
    setErrorText('')
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
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setErrorText(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader eyebrow="Routing" title="模型分组" description="每个分组内同名模型只能绑定一个渠道；API Key 可以按顺序绑定多个分组。" actions={<Button onClick={() => edit()}><PlusIcon data-icon="inline-start" />新建分组</Button>} />
      {error || errorText ? <Alert variant="destructive"><AlertDescription>{String(error ?? errorText)}</AlertDescription></Alert> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>编码</TableHead><TableHead>名称</TableHead><TableHead>模型数</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5}>加载中…</TableCell></TableRow> : data.groups.map((group) => (
                <TableRow key={group.id} data-state={selectedGroupID === group.id ? 'selected' : undefined} onClick={() => edit(group)}>
                  <TableCell className="font-mono">{group.code}</TableCell><TableCell className="max-w-28"><div className="flex max-w-28 min-w-0 flex-col items-start gap-1"><span className="w-full truncate" title={group.name}>{group.name}</span><Badge variant="outline" className="max-w-full truncate" title={group.model_provider || '待配置'}>{group.model_provider || '待配置'}</Badge></div></TableCell><TableCell>{group.model_count ?? 0}</TableCell>
                  <TableCell><Badge variant={group.is_active === false ? 'secondary' : 'default'}>{group.is_active === false ? '停用' : '启用'}</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); edit(group) }}>编辑</Button><Button size="sm" variant="ghost" disabled={togglingGroupID === group.id} onClick={(event) => { event.stopPropagation(); void toggle(group) }}><PowerIcon data-icon="inline-start" />{togglingGroupID === group.id ? '处理中...' : group.is_active === false ? '启用' : '停用'}</Button><Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); void remove(group) }}><Trash2Icon /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>分组编码</Label><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="standard" /></div><div><Label>分组名称</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="标准组" /></div></div>
          <div><Label htmlFor="group-model-provider">模型企业</Label><NativeSelect id="group-model-provider" disabled={providerLocked} value={String(form.model_provider_id || '')} onChange={(event) => setForm((current) => ({ ...current, model_provider_id: Number(event.target.value) }))}><option value="">请选择企业</option>{data.providers.filter((provider) => provider.is_active !== false || (Boolean(form.id) && provider.id === form.model_provider_id)).map((provider) => <option key={provider.id} value={provider.id} disabled={provider.is_active === false}>{provider.name}{provider.is_active === false ? '（已停用）' : ''}</option>)}</NativeSelect>{providerLocked ? <p className="mt-1 text-xs text-muted-foreground">已有模型绑定，需先清空绑定才能更换企业。</p> : null}</div>
          <div><Label>描述</Label><Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
          <div className="border-t pt-4">
            <Label>模型绑定</Label>
            {!form.model_provider_id ? <p className="mt-2 text-sm text-muted-foreground">请先选择模型企业，再选择该企业的模型渠道。</p> : null}
            {selectedProviderInactive ? <p className="mt-2 text-sm text-muted-foreground">当前企业已停用，仅可修改其他字段，不能调整模型绑定。</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2"><Input className="max-w-sm" value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="搜索模型" /><Button variant="outline" disabled={selectedProviderInactive} onClick={() => setSelectedModelChannels(Object.fromEntries(modelOptions.map((item) => [item.model, item.channels.length === 1 ? String(item.channels[0].id) : selectedModelChannels[item.model] ?? ''])))}>全选</Button><Button variant="outline" disabled={selectedProviderInactive} onClick={() => setSelectedModelChannels({})}>清空</Button><span className="text-sm text-muted-foreground">已选 {Object.keys(selectedModelChannels).length} / {modelOptions.length}</span></div>
            <Table className="mt-3"><TableHeader><TableRow><TableHead className="w-16">选择</TableHead><TableHead>公开模型</TableHead><TableHead>渠道</TableHead></TableRow></TableHeader><TableBody>
              {visibleModelOptions.map((item) => { const selected = Object.prototype.hasOwnProperty.call(selectedModelChannels, item.model); return <TableRow key={item.model}><TableCell><Checkbox disabled={selectedProviderInactive} checked={selected} onCheckedChange={(checked) => setSelectedModelChannels((current) => { const next = { ...current }; if (checked) next[item.model] = item.channels.length === 1 ? String(item.channels[0].id) : ''; else delete next[item.model]; return next })} /></TableCell><TableCell className="font-mono">{item.model}</TableCell><TableCell><NativeSelect disabled={!selected || selectedProviderInactive} value={selectedModelChannels[item.model] ?? ''} onChange={(event) => setSelectedModelChannels((current) => ({ ...current, [item.model]: event.target.value }))}><option value="">{item.channels.length > 1 ? '请选择一个渠道' : '选择渠道'}</option>{item.channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.id} · {channel.name ?? channel.display_name ?? item.model}</option>)}</NativeSelect></TableCell></TableRow> })}
              {visibleModelOptions.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">没有匹配的模型</TableCell></TableRow> : null}
            </TableBody></Table>
            <div className="mt-3 flex justify-end"><Button onClick={() => void save()} disabled={saving}><SaveIcon data-icon="inline-start" />{saving ? '保存中...' : form.id ? '保存修改' : '创建并保存'}</Button></div>
          </div>
        </Card>
      </div>
    </>
  )
}
