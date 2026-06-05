import { useState } from 'react'
import { PlusIcon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons'
import { KeyRoundIcon, LinkIcon, Loader2, RefreshCwIcon, ServerIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { NativeSelect } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  adminApi,
  type AdminUpstreamChannelBindingCandidate,
  type AdminUpstreamChannelSyncResult,
  type AdminUpstreamPlatform,
} from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'
import { toast } from 'sonner'

type PlatformForm = {
  name: string
  platform_type: string
  base_url: string
  api_key: string
  system_token: string
  upstream_user_id: string
  upstream_group: string
  note: string
  is_active: boolean
}

type KeyForm = {
  name: string
  group: string
  remain_quota: string
  unlimited_quota: boolean
  save_to_platform: boolean
}

const defaultForm: PlatformForm = {
  name: 'zzshu',
  platform_type: 'newapi',
  base_url: 'https://us.zzshu.cc',
  api_key: '',
  system_token: '',
  upstream_user_id: '',
  upstream_group: 'Claude KIRO',
  note: '',
  is_active: true,
}

function formatBalance(p: AdminUpstreamPlatform) {
  const currency = p.balance_currency || 'CNY'
  if (p.balance_synced_at && p.balance_amount != null) {
    if (currency === 'CNY') return `¥${p.balance_amount.toFixed(4)}`
    return `${currency} ${p.balance_amount.toFixed(4)}`
  }
  if (p.balance != null && p.balance > 0) return `¥${(p.balance / 1_000_000).toFixed(4)}`
  return '-'
}

function platformLabel(type?: string) {
  if (type === 'newapi') return 'New API'
  if (type === 'sub2api') return 'Sub2API'
  return 'OpenAI'
}

function supportsManagedOps(type?: string) {
  return type === 'newapi' || type === 'sub2api'
}

function syncResultText(res: AdminUpstreamChannelSyncResult) {
  const parts: string[] = []
  if (res.bound !== undefined) parts.push(`绑定 ${res.bound ?? 0}`)
  if (res.created !== undefined) parts.push(`新增 ${res.created ?? 0}`)
  if (res.bound === undefined && res.updated !== undefined) parts.push(`更新 ${res.updated ?? 0}`)
  if (res.skipped) parts.push(`跳过 ${res.skipped}`)
  if (res.price_synced) parts.push(`价格 ${res.price_synced}`)
  if (res.price_unavailable) parts.push(`无公开价格 ${res.price_unavailable}`)
  return parts.join('，')
}

export function AdminUpstreamPage() {
  const { data: platforms, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listUpstreamPlatforms()
    return res.platforms ?? []
  }, [] as AdminUpstreamPlatform[], [])

  const [mutError, setMutError] = useState('')
  const [editing, setEditing] = useState<AdminUpstreamPlatform | null>(null)
  const [form, setForm] = useState<PlatformForm>(defaultForm)

  const [modelsPlatform, setModelsPlatform] = useState<AdminUpstreamPlatform | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsList, setModelsList] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [syncingChannels, setSyncingChannels] = useState(false)
  const [markup, setMarkup] = useState('1')

  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [keyPlatform, setKeyPlatform] = useState<AdminUpstreamPlatform | null>(null)
  const [keyForm, setKeyForm] = useState<KeyForm>({
    name: '',
    group: 'Claude KIRO',
    remain_quota: '',
    unlimited_quota: true,
    save_to_platform: true,
  })
  const [keyLoading, setKeyLoading] = useState(false)
  const [bindingPlatform, setBindingPlatform] = useState<AdminUpstreamPlatform | null>(null)
  const [bindingLoading, setBindingLoading] = useState(false)
  const [bindingCandidates, setBindingCandidates] = useState<AdminUpstreamChannelBindingCandidate[]>([])
  const [selectedBindingIds, setSelectedBindingIds] = useState<Set<number>>(new Set())
  const [bindingMarkup, setBindingMarkup] = useState('1')
  const [bindingUpdatePrice, setBindingUpdatePrice] = useState(true)
  const [bindingSaving, setBindingSaving] = useState(false)

  async function openModels(p: AdminUpstreamPlatform) {
    setModelsPlatform(p)
    setModelsList([])
    setSelectedModels(new Set())
    setMarkup('1')
    setModelsLoading(true)
    try {
      const res = await adminApi.getUpstreamModels(p.id!)
      setModelsList(res.models ?? [])
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setModelsLoading(false)
    }
  }

  function toggleModel(m: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  function toggleAllModels() {
    if (selectedModels.size === modelsList.length) {
      setSelectedModels(new Set())
    } else {
      setSelectedModels(new Set(modelsList))
    }
  }

  async function batchCreateChannels() {
    if (!modelsPlatform?.id || selectedModels.size === 0) return
    setCreating(true)
    try {
      const res = await adminApi.batchCreateChannelsFromUpstream(
        modelsPlatform.id,
        [...selectedModels],
        Number(markup) > 0 ? Number(markup) : 1
      )
      const skipped = res.skipped ? `，跳过 ${res.skipped} 个` : ''
      const unavailable = res.price_unavailable ? `，${res.price_unavailable} 个无公开价格` : ''
      toast.success(`成功创建 ${res.created ?? 0} 个渠道${skipped}${unavailable}`)
      setModelsPlatform(null)
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function syncChannels() {
    if (!modelsPlatform?.id || selectedModels.size === 0) return
    setSyncingChannels(true)
    try {
      const res = await adminApi.syncUpstreamChannels(
        modelsPlatform.id,
        [...selectedModels],
        Number(markup) > 0 ? Number(markup) : 1
      )
      toast.success(`渠道已同步：${syncResultText(res)}`)
      setModelsPlatform(null)
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setSyncingChannels(false)
    }
  }

  function openCreate() {
    setEditing({})
    setForm(defaultForm)
    setMutError('')
  }

  function openEdit(p: AdminUpstreamPlatform) {
    setEditing(p)
    setForm({
      name: p.name ?? '',
      platform_type: p.platform_type ?? 'openai',
      base_url: p.base_url ?? '',
      api_key: '',
      system_token: '',
      upstream_user_id: p.upstream_user_id ?? '',
      upstream_group: p.upstream_group ?? '',
      note: p.note ?? '',
      is_active: p.is_active ?? true,
    })
    setMutError('')
  }

  async function handleSave() {
    setMutError('')
    const payload = {
      name: form.name,
      platform_type: form.platform_type,
      base_url: form.base_url,
      upstream_user_id: form.upstream_user_id,
      upstream_group: form.upstream_group,
      note: form.note,
      is_active: form.is_active,
      ...(form.api_key ? { api_key: form.api_key } : {}),
      ...(form.system_token ? { system_token: form.system_token } : {}),
    }
    try {
      if (editing?.id) {
        await adminApi.updateUpstreamPlatform(editing.id, payload)
      } else {
        await adminApi.createUpstreamPlatform(payload)
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
      await adminApi.deleteUpstreamPlatform(id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function syncBalance(p: AdminUpstreamPlatform) {
    if (!p.id) return
    setSyncingId(p.id)
    try {
      await adminApi.syncUpstreamBalance(p.id)
      toast.success('余额已同步')
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setSyncingId(null)
    }
  }

  function openKeyDialog(p: AdminUpstreamPlatform) {
    setKeyPlatform(p)
    setKeyForm({
      name: `fanapi-${p.name || 'upstream'}`,
      group: p.upstream_group || (p.platform_type === 'sub2api' ? '' : 'Claude KIRO'),
      remain_quota: '',
      unlimited_quota: true,
      save_to_platform: true,
    })
  }

  async function generateKey() {
    if (!keyPlatform?.id) return
    setKeyLoading(true)
    try {
      await adminApi.createUpstreamApiKey(keyPlatform.id, {
        name: keyForm.name,
        group: keyForm.group,
        remain_quota: keyForm.unlimited_quota ? -1 : Number(keyForm.remain_quota || 0),
        unlimited_quota: keyForm.unlimited_quota,
        expired_time: -1,
        save_to_platform: keyForm.save_to_platform,
      })
      toast.success(keyForm.save_to_platform ? '调用 Key 已生成并保存' : '调用 Key 已生成')
      setKeyPlatform(null)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setKeyLoading(false)
    }
  }

  async function openBindingDialog(p: AdminUpstreamPlatform) {
    if (!p.id) return
    setBindingPlatform(p)
    setBindingCandidates([])
    setSelectedBindingIds(new Set())
    setBindingMarkup('1')
    setBindingUpdatePrice(true)
    setBindingLoading(true)
    try {
      const res = await adminApi.previewUpstreamChannelBindings(p.id, 1)
      const candidates = res.candidates ?? []
      setBindingCandidates(candidates)
      setSelectedBindingIds(new Set(
        candidates
          .filter((item) => item.channel_id && !item.existing_platform_id)
          .map((item) => item.channel_id)
      ))
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setBindingLoading(false)
    }
  }

  function toggleBindingCandidate(id: number) {
    setSelectedBindingIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleUnboundBindingCandidates() {
    const ids = bindingCandidates
      .filter((item) => item.channel_id && !item.existing_platform_id)
      .map((item) => item.channel_id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedBindingIds.has(id))
    setSelectedBindingIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  async function bindSelectedChannels() {
    if (!bindingPlatform?.id || selectedBindingIds.size === 0) return
    setBindingSaving(true)
    try {
      const res = await adminApi.bindUpstreamChannels(
        bindingPlatform.id,
        [...selectedBindingIds],
        Number(bindingMarkup) > 0 ? Number(bindingMarkup) : 1,
        bindingUpdatePrice
      )
      toast.success(`历史渠道已归类：${syncResultText(res)}`)
      setBindingPlatform(null)
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setBindingSaving(false)
    }
  }

  const bindingUnboundIds = bindingCandidates
    .filter((item) => item.channel_id && !item.existing_platform_id)
    .map((item) => item.channel_id)
  const bindingUnboundAllSelected = bindingUnboundIds.length > 0 && bindingUnboundIds.every((id) => selectedBindingIds.has(id))

  return (
    <>
      <PageHeader
        eyebrow="Upstream"
        title="上游平台"
        description="管理 API 供应商配置，监控可用余额。"
        actions={
          <Button size="sm" onClick={openCreate}>
            <PlusIcon className="mr-1 size-3.5" />添加平台
          </Button>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error)}</AlertDescription>
        </Alert>
      ) : null}
      {mutError ? (
        <Alert variant="destructive">
          <AlertDescription>{mutError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>接入地址</TableHead>
              <TableHead className="w-36 text-right">可用余额</TableHead>
              <TableHead>凭证</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-40">余额同步时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={9} /> : (
            <TableBody>
              {platforms.length === 0 ? (
                <TableEmpty cols={9} Icon={ServerIcon} title="暂无上游平台" description="点击右上角添加。" />
              ) : platforms.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.upstream_group || p.note || '-'}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{platformLabel(p.platform_type)}</Badge></TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground">{p.base_url}</TableCell>
                  <TableCell className="text-right font-mono">{formatBalance(p)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={p.has_api_key ? 'default' : 'secondary'}>sk</Badge>
                      <Badge variant={p.has_system_token ? 'default' : 'secondary'}>token</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.is_active
                      ? <Badge className="bg-emerald-600 text-white">正常</Badge>
                      : <Badge variant="secondary">停用</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.balance_synced_at ? new Date(p.balance_synced_at).toLocaleString('zh-CN') : '未同步'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openModels(p)}>
                        获取模型
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openBindingDialog(p)}>
                        <LinkIcon className="size-3.5" />归类历史渠道
                      </Button>
                      {supportsManagedOps(p.platform_type) ? (
                        <>
                          <Button size="sm" variant="outline" disabled={syncingId === p.id} onClick={() => syncBalance(p)}>
                            {syncingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
                            同步余额
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openKeyDialog(p)}>
                            <KeyRoundIcon className="size-3.5" />生成 Key
                          </Button>
                        </>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        <Pencil1Icon className="size-3.5" />编辑
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => p.id && handleDelete(p.id)}>
                        <TrashIcon className="size-3.5" />删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? '编辑上游平台' : '添加上游平台'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="zzshu" />
            </div>
            <div className="space-y-1.5">
              <Label>平台类型</Label>
              <NativeSelect value={form.platform_type} onChange={(e) => setForm((f) => ({ ...f, platform_type: e.target.value }))}>
                <option value="newapi">zzshu / New API</option>
                <option value="sub2api">modelboxs / Sub2API</option>
                <option value="openai">OpenAI 兼容</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>API Base URL</Label>
              <Input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} placeholder="https://us.zzshu.cc" />
            </div>
            <div className="space-y-1.5">
              <Label>调用 API Key</Label>
              <Input type="password" value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} placeholder={editing?.id ? '留空不修改' : 'sk-...'} />
            </div>
            <div className="space-y-1.5">
              <Label>{form.platform_type === 'sub2api' ? '控制台 JWT' : '系统访问令牌'}</Label>
              <Input type="password" value={form.system_token} onChange={(e) => setForm((f) => ({ ...f, system_token: e.target.value }))} placeholder={editing?.id ? '留空不修改' : form.platform_type === 'sub2api' ? 'eyJ...' : 'zzshu token'} />
            </div>
            <div className="space-y-1.5">
              <Label>上游用户 ID</Label>
              <Input value={form.upstream_user_id} onChange={(e) => setForm((f) => ({ ...f, upstream_user_id: e.target.value }))} placeholder="New-Api-User" />
            </div>
            <div className="space-y-1.5">
              <Label>默认分组</Label>
              <Input value={form.upstream_group} onChange={(e) => setForm((f) => ({ ...f, upstream_group: e.target.value }))} placeholder={form.platform_type === 'sub2api' ? '分组 ID 或分组名' : 'Claude KIRO'} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>备注</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))} />
              启用
            </label>
            {mutError ? <p className="text-sm text-destructive md:col-span-2">{mutError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={keyPlatform !== null} onOpenChange={(open) => !open && setKeyPlatform(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成调用 Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input value={keyForm.name} onChange={(e) => setKeyForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>分组</Label>
              <Input value={keyForm.group} onChange={(e) => setKeyForm((f) => ({ ...f, group: e.target.value }))} placeholder={keyPlatform?.platform_type === 'sub2api' ? '分组 ID 或分组名' : 'Claude KIRO'} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={keyForm.unlimited_quota} onCheckedChange={(v) => setKeyForm((f) => ({ ...f, unlimited_quota: v === true }))} />
              不限制额度
            </label>
            {!keyForm.unlimited_quota ? (
              <div className="space-y-1.5">
                <Label>额度 quota</Label>
                <Input type="number" value={keyForm.remain_quota} onChange={(e) => setKeyForm((f) => ({ ...f, remain_quota: e.target.value }))} placeholder="500000" />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={keyForm.save_to_platform} onCheckedChange={(v) => setKeyForm((f) => ({ ...f, save_to_platform: v === true }))} />
              保存为平台调用 Key
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyPlatform(null)}>取消</Button>
            <Button disabled={keyLoading} onClick={generateKey}>
              {keyLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bindingPlatform !== null} onOpenChange={(open) => !open && setBindingPlatform(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>归类历史渠道</DialogTitle>
            <DialogDescription>
              {bindingPlatform?.name ?? '-'} · {bindingPlatform?.base_url ?? '-'}
            </DialogDescription>
          </DialogHeader>
          {bindingLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在匹配历史渠道...</p>
          ) : bindingCandidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">没有匹配到可归类的历史渠道。</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id="binding-select-unbound"
                    checked={bindingUnboundAllSelected}
                    onCheckedChange={toggleUnboundBindingCandidates}
                  />
                  <span className="font-medium">未绑定 {bindingUnboundIds.length} 个，已选 {selectedBindingIds.size} 个</span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={bindingUpdatePrice}
                      onCheckedChange={(v) => setBindingUpdatePrice(v === true)}
                    />
                    同步可用价格
                  </label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">售价倍率</Label>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={bindingMarkup}
                      onChange={(e) => setBindingMarkup(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="max-h-[420px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>渠道</TableHead>
                      <TableHead>模型</TableHead>
                      <TableHead>接入地址</TableHead>
                      <TableHead className="w-24">状态</TableHead>
                      <TableHead className="w-28">价格</TableHead>
                      <TableHead className="w-32">归属</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bindingCandidates.map((item) => (
                      <TableRow key={item.channel_id}>
                        <TableCell>
                          <Checkbox
                            id={`binding-${item.channel_id}`}
                            checked={selectedBindingIds.has(item.channel_id)}
                            onCheckedChange={() => toggleBindingCandidate(item.channel_id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[220px] truncate font-medium">{item.name || `#${item.channel_id}`}</div>
                          <div className="text-xs text-muted-foreground">#{item.channel_id}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[220px] truncate font-mono text-xs">{item.model || '-'}</div>
                          {item.display_name ? (
                            <div className="max-w-[220px] truncate text-xs text-muted-foreground">{item.display_name}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">
                          {item.base_url || '-'}
                        </TableCell>
                        <TableCell>
                          {item.is_active
                            ? <Badge className="bg-emerald-600 text-white">启用</Badge>
                            : <Badge variant="secondary">停用</Badge>}
                        </TableCell>
                        <TableCell>
                          {item.price_available
                            ? <Badge variant="outline">可同步</Badge>
                            : <Badge variant="secondary">保留原价</Badge>}
                        </TableCell>
                        <TableCell>
                          {item.existing_platform_id
                            ? item.existing_platform_id === bindingPlatform?.id
                              ? <Badge variant="secondary">已归类</Badge>
                              : <Badge variant="outline">平台 #{item.existing_platform_id}</Badge>
                            : <Badge variant="outline">未归类</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindingPlatform(null)}>取消</Button>
            <Button disabled={selectedBindingIds.size === 0 || bindingSaving} onClick={bindSelectedChannels}>
              {bindingSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              绑定 {selectedBindingIds.size} 个渠道
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modelsPlatform !== null} onOpenChange={(open) => !open && setModelsPlatform(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>获取模型列表</DialogTitle>
          </DialogHeader>
          {modelsLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在从上游拉取模型...</p>
          ) : modelsList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">未获取到模型，请检查凭证和 Base URL</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b pb-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedModels.size === modelsList.length}
                    onCheckedChange={toggleAllModels}
                  />
                  <span className="text-sm font-medium">全选 {selectedModels.size}/{modelsList.length}</span>
                </label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">售价倍率</Label>
                  <Input className="h-8 w-20" type="number" min="0.01" step="0.01" value={markup} onChange={(e) => setMarkup(e.target.value)} />
                </div>
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {modelsList.map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      id={`model-${m}`}
                      checked={selectedModels.has(m)}
                      onCheckedChange={() => toggleModel(m)}
                    />
                    <span className="font-mono text-xs">{m}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModelsPlatform(null)}>取消</Button>
            <Button variant="outline" disabled={selectedModels.size === 0 || syncingChannels} onClick={syncChannels}>
              {syncingChannels ? '同步中...' : '同步渠道/价格'}
            </Button>
            <Button disabled={selectedModels.size === 0 || creating} onClick={batchCreateChannels}>
              {creating ? '创建中...' : `一键添加 ${selectedModels.size} 个渠道`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
