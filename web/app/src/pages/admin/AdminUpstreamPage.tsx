import { useState } from 'react'
import { PlusIcon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons'

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
import { ServerIcon } from 'lucide-react'
import { adminApi, type AdminUpstreamPlatform } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'
import { toast } from 'sonner'

export function AdminUpstreamPage() {
  const { data: platforms, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listUpstreamPlatforms()
    return res.platforms ?? []
  }, [] as AdminUpstreamPlatform[], [])

  const [mutError, setMutError] = useState('')
  const [editing, setEditing] = useState<AdminUpstreamPlatform | null>(null)
  const [form, setForm] = useState({ name: '', base_url: '', api_key: '', note: '' })

  // 模型列表 dialog
  const [modelsPlatform, setModelsPlatform] = useState<AdminUpstreamPlatform | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsList, setModelsList] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  async function openModels(p: AdminUpstreamPlatform) {
    setModelsPlatform(p)
    setModelsList([])
    setSelectedModels(new Set())
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
      const res = await adminApi.batchCreateChannelsFromUpstream(modelsPlatform.id, [...selectedModels])
      toast.success(`成功创建 ${res.created} 个渠道`)
      setModelsPlatform(null)
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      toast.error(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  function openCreate() {
    setEditing({})
    setForm({ name: '', base_url: '', api_key: '', note: '' })
    setMutError('')
  }

  function openEdit(p: AdminUpstreamPlatform) {
    setEditing(p)
    setForm({ name: p.name ?? '', base_url: p.base_url ?? '', api_key: '', note: p.note ?? '' })
    setMutError('')
  }

  async function handleSave() {
    setMutError('')
    try {
      if (editing?.id) {
        await adminApi.updateUpstreamPlatform(editing.id, { name: form.name, base_url: form.base_url, note: form.note })
      } else {
        await adminApi.createUpstreamPlatform({ ...form })
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
              <TableHead>接入地址</TableHead>
              <TableHead className="w-36 text-right">可用余额（¥）</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-40">余额同步时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={8} /> : (
            <TableBody>
              {platforms.length === 0 ? (
                <TableEmpty cols={8} Icon={ServerIcon} title="暂无上游平台" description="点击右上角添加。" />
              ) : platforms.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.id}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.base_url}</TableCell>
                  <TableCell className="text-right font-mono">
                    {p.balance != null ? `¥${p.balance.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>
                    {p.is_active
                      ? <Badge className="bg-emerald-600 text-white">正常</Badge>
                      : <Badge variant="secondary">停用</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.note || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.balance_synced_at ? new Date(p.balance_synced_at).toLocaleString('zh-CN') : '未同步'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openModels(p)}>
                        获取模型
                      </Button>
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

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? '编辑上游平台' : '添加上游平台'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：OpenAI 官方" />
            </div>
            <div className="space-y-1.5">
              <Label>API Base URL</Label>
              <Input value={form.base_url} onChange={(e) => setForm(f => ({ ...f, base_url: e.target.value }))} placeholder="https://api.openai.com" />
            </div>
            {!editing?.id ? (
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <Input type="password" value={form.api_key} onChange={(e) => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder="sk-…" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Input value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            {mutError ? <p className="text-sm text-destructive">{mutError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 模型列表 dialog */}
      <Dialog open={modelsPlatform !== null} onOpenChange={(o) => !o && setModelsPlatform(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>获取模型列表 — {modelsPlatform?.name}</DialogTitle>
          </DialogHeader>
          {modelsLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在从上游拉取模型…</p>
          ) : modelsList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">未获取到模型，请检查 API Key 和 Base URL</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b pb-2">
                <Checkbox
                  id="select-all"
                  checked={selectedModels.size === modelsList.length}
                  onCheckedChange={toggleAllModels}
                />
                <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  全选（{selectedModels.size}/{modelsList.length}）
                </Label>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {modelsList.map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <Checkbox
                      id={`model-${m}`}
                      checked={selectedModels.has(m)}
                      onCheckedChange={() => toggleModel(m)}
                    />
                    <Label htmlFor={`model-${m}`} className="font-mono text-xs cursor-pointer">{m}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModelsPlatform(null)}>取消</Button>
            <Button
              disabled={selectedModels.size === 0 || creating}
              onClick={batchCreateChannels}
            >
              {creating ? '创建中…' : `一键添加 ${selectedModels.size} 个渠道`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
