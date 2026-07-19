import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannel, type AdminModelGroup, type AdminModelGroupModel } from '@/lib/api/admin'

type GroupForm = { id?: number; code: string; name: string; description: string; is_active: boolean }

const emptyForm: GroupForm = { code: '', name: '', description: '', is_active: true }

export function AdminModelGroupsPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [groupsResponse, channelsResponse] = await Promise.all([
      adminApi.listModelGroups(true),
      adminApi.listChannels({ page: 1, size: 100 }),
    ])
    return {
      groups: groupsResponse.groups ?? [],
      channels: Array.isArray(channelsResponse) ? channelsResponse : channelsResponse.channels ?? [],
    }
  }, { groups: [] as AdminModelGroup[], channels: [] as AdminChannel[] })

  const [form, setForm] = useState<GroupForm>(emptyForm)
  const [selectedGroupID, setSelectedGroupID] = useState<number>()
  const [models, setModels] = useState<AdminModelGroupModel[]>([])
  const [channelID, setChannelID] = useState('')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!selectedGroupID) {
      setModels([])
      return
    }
    void adminApi.listModelGroupModels(selectedGroupID).then((response) => setModels(response.models ?? []))
  }, [selectedGroupID, data.groups])

  function edit(group?: AdminModelGroup) {
    setForm(group ? {
      id: group.id,
      code: group.code ?? '',
      name: group.name ?? '',
      description: group.description ?? '',
      is_active: group.is_active !== false,
    } : emptyForm)
    setErrorText('')
  }

  async function save() {
    setErrorText('')
    try {
      if (form.id) {
        await adminApi.updateModelGroup(form.id, form)
      } else {
        await adminApi.createModelGroup(form)
      }
      edit()
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setErrorText(getApiErrorMessage(err))
    }
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

  async function bindChannel() {
    if (!selectedGroupID || !channelID) return
    const channel = data.channels.find((item) => String(item.id) === channelID)
    const routingModel = channel?.display_name?.trim() || channel?.model?.trim() || channel?.name?.trim() || ''
    if (!routingModel || !channel?.id) return
    try {
      await adminApi.bindModelGroupModel(selectedGroupID, { channel_id: channel.id, routing_model: routingModel })
      setChannelID('')
      setModels((await adminApi.listModelGroupModels(selectedGroupID)).models ?? [])
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setErrorText(getApiErrorMessage(err))
    }
  }

  async function unbind(binding: AdminModelGroupModel) {
    if (!selectedGroupID || !binding.id) return
    try {
      await adminApi.unbindModelGroupModel(selectedGroupID, binding.id)
      setModels((await adminApi.listModelGroupModels(selectedGroupID)).models ?? [])
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setErrorText(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Routing"
        title="模型分组"
        description="每个分组内同名模型只能绑定一个渠道；API Key 可以按顺序绑定多个分组。"
        actions={<Button onClick={() => edit()}><PlusIcon data-icon="inline-start" />新建分组</Button>}
      />
      {error || errorText ? <Alert variant="destructive"><AlertDescription>{String(error ?? errorText)}</AlertDescription></Alert> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1.1fr)]">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>编码</TableHead><TableHead>名称</TableHead><TableHead>模型数</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5}>加载中…</TableCell></TableRow> : data.groups.map((group) => (
                <TableRow key={group.id} data-state={selectedGroupID === group.id ? 'selected' : undefined} onClick={() => setSelectedGroupID(group.id)}>
                  <TableCell className="font-mono">{group.code}</TableCell>
                  <TableCell>{group.name}</TableCell>
                  <TableCell>{group.model_count ?? 0}</TableCell>
                  <TableCell><Badge variant={group.is_active === false ? 'secondary' : 'default'}>{group.is_active === false ? '停用' : '启用'}</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); edit(group) }}>编辑</Button><Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); void remove(group) }}><Trash2Icon /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>分组编码</Label><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="cheap" /></div>
            <div><Label>分组名称</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="低价组" /></div>
          </div>
          <div><Label>描述</Label><Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
          <Button onClick={() => void save()}><SaveIcon data-icon="inline-start" />{form.id ? '保存分组' : '创建分组'}</Button>
          <div className="border-t pt-4">
            <Label>当前分组绑定渠道模型</Label>
            <div className="mt-2 flex gap-2">
              <Select value={channelID} onValueChange={setChannelID} disabled={!selectedGroupID}>
                <SelectTrigger><SelectValue placeholder="选择渠道" /></SelectTrigger>
                <SelectContent>{data.channels.map((channel) => <SelectItem key={channel.id} value={String(channel.id)}>{channel.display_name || channel.model || channel.name} · #{channel.id}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void bindChannel()} disabled={!selectedGroupID || !channelID}>绑定</Button>
            </div>
            <div className="mt-3 space-y-2">
              {models.map((binding) => <div key={binding.id} className="flex items-center justify-between rounded-md border p-2 text-sm"><span>{binding.routing_model} · 渠道 #{binding.channel_id}</span><Button size="sm" variant="ghost" onClick={() => void unbind(binding)}>移除</Button></div>)}
              {selectedGroupID && models.length === 0 ? <p className="text-sm text-muted-foreground">该分组还没有模型。</p> : null}
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
