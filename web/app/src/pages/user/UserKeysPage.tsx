import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useMemo, useState } from 'react'
import { CCSwitchImport } from './CCSwitchImport'
import { KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { ModelGroupSelector } from '@/components/shared/ModelGroupSelector'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { copyToClipboard } from '@/lib/clipboard'
import { userApi, type ApiKeyModelGroup, type ApiKeyRecord } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'
import { useAsync } from '@/hooks/use-async'

function spendText(value: number | undefined) {
  return `${formatCredits(value ?? 0)} 积分`
}

export function UserKeysPage() {
  const [detailKey, setDetailKey] = useState<ApiKeyRecord | null>(null)
  const { data: keys, loading, error: loadError, reload } = useAsync(async () => {
    const response = await userApi.listApiKeys()
    return Array.isArray(response) ? response : response.api_keys ?? response.keys ?? []
  }, [] as ApiKeyRecord[])

  const { data: availableGroups } = useAsync(async () => {
    const response = await userApi.listModelGroups()
    return response.groups ?? []
  }, [] as ApiKeyModelGroup[])

  const [mutError, setMutError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [bindingKey, setBindingKey] = useState<ApiKeyRecord>()
  const [bindingIds, setBindingIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | undefined>()

  const bindingGroups = useMemo(() => {
    const merged = new Map(availableGroups.flatMap((group) => group.id ? [[group.id, group] as const] : []))
    for (const binding of bindingKey?.model_groups ?? []) {
      if (binding.group_id && binding.group) merged.set(binding.group_id, binding.group)
    }
    return [...merged.values()]
  }, [availableGroups, bindingKey])

  const importKeys = keys.map(item => ({ id: String(item.id), name: item.name || '未命名密钥', key: item.viewable ? (item.raw_key ?? item.key ?? '') : '', unavailable: item.is_active === false || item.needs_group_binding === true || !item.viewable || !(item.raw_key || item.key) }))
  const error = loadError || mutError

  async function handleCreate() {
    if (!newKeyName.trim()) {
      setMutError('请输入密钥名称')
      return
    }
    if (selectedGroupIds.length === 0) {
      setMutError('请至少选择一个模型分组')
      return
    }
    setSubmitting(true)
    setMutError('')
    try {
      const response = await userApi.createApiKey(newKeyName.trim(), selectedGroupIds)
      setCreatedKey(String((response as { key?: string }).key ?? ''))
      setCreateOpen(false)
      setNewKeyName('')
      setSelectedGroupIds([])
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  function openBindings(item: ApiKeyRecord) {
    setBindingKey(item)
    setBindingIds((item.model_groups ?? []).slice().sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)).map((group) => group.group_id ?? 0).filter(Boolean))
  }

  async function saveBindings() {
    if (!bindingKey?.id || bindingIds.length === 0) return
    setMutError('')
    try {
      await userApi.replaceApiKeyModelGroups(bindingKey.id, bindingIds)
      setBindingKey(undefined)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function executeDelete() {
    if (!pendingDeleteId) return
    setMutError('')
    try {
      await userApi.deleteApiKey(pendingDeleteId)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingDeleteId(undefined)
    }
  }

  function copyText(text: string) {
    void copyToClipboard(text, {
      successMessage: '密钥已复制',
      emptyMessage: '没有可复制的密钥',
    })
  }

  return (
    <>
      <PageHeader
        title="API 密钥管理"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            新建密钥
          </Button>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">支持导入 CC Switch 指定密钥，灵活切换不同服务源。<span className="ml-3">共 {keys.length} 个密钥</span></div>
      {loading ? (
        <Card className="overflow-hidden">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>密钥类型</TableHead>
                <TableHead>权限范围</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableSkeleton cols={5} rows={3} />
          </Table>
        </Card>
      ) : keys.length === 0 ? (
        <Card className="overflow-hidden">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>密钥类型</TableHead>
                <TableHead>权限范围</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableEmpty
                cols={5}
                Icon={KeyRoundIcon}
                title="还没有 API 密钥"
                description="点击右上角「新建密钥」即可创建并导入 CC Switch。"
              />
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>密钥类型</TableHead>
                <TableHead>权限范围</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((item, index) => (
                <TableRow key={item.id ?? index}>
                  <TableCell><button className="cursor-pointer font-medium hover:underline" onClick={() => setDetailKey(item)}>{item.name ?? '未命名'}</button></TableCell>
                  <TableCell>{item.key_type || '—'}</TableCell>
                  <TableCell><KeyGroupSummary item={item} /></TableCell>
                  <TableCell>{item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', {hour12:false}) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <CCSwitchImport keys={importKeys} selectedId={String(item.id)} />
                      {item.viewable && (item.raw_key || item.key) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyText((item.raw_key ?? item.key) as string)}
                        >
                          复制
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openBindings(item)}
                      >
                        分组排序
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDeleteId(item.id)}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <CCSwitchImport keys={importKeys} />
        <Button onClick={() => setCreateOpen(true)}>创建新密钥</Button>
      </div>
      <Dialog open={Boolean(detailKey)} onOpenChange={open => { if (!open) setDetailKey(null) }}>
        <DialogContent><DialogHeader><DialogTitle>{detailKey?.name || '密钥详情'}</DialogTitle></DialogHeader>
          {detailKey && <dl className="grid grid-cols-[auto_1fr] gap-3 text-sm">
            <dt>密钥</dt><dd className="break-all font-mono">{detailKey.viewable ? detailKey.raw_key || detailKey.key || '—' : detailKey.masked_key || detailKey.key_prefix || '—'}</dd>
            <dt>状态</dt><dd>{detailKey.is_active === false ? '停用' : '启用'}</dd>
            <dt>今日消耗</dt><dd>{spendText(detailKey.today_consumed)}</dd>
            <dt>累计消耗</dt><dd>{spendText(detailKey.total_consumed)}</dd>
          </dl>}
        </DialogContent>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>创建 API 密钥</DialogTitle>
            <DialogDescription>
              创建后请妥善保管密钥，也可直接导入 CC Switch。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-api-key-name">名称</Label>
              <Input
                id="new-api-key-name"
                value={newKeyName}
                onChange={(event) => setNewKeyName(event.target.value)}
                placeholder="例如：我的项目"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>模型分组顺序</Label>
              <ModelGroupSelector groups={availableGroups} selectedIds={selectedGroupIds} onChange={setSelectedGroupIds} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bindingKey)} onOpenChange={() => setBindingKey(undefined)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>调整模型分组顺序</DialogTitle>
            <DialogDescription>第一组优先调用，后续分组只在可重试失败时作为回退。</DialogDescription>
          </DialogHeader>
          <div className="min-w-0 overflow-y-auto">
            <ModelGroupSelector groups={bindingGroups} selectedIds={bindingIds} onChange={setBindingIds} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBindingKey(undefined)}>取消</Button><Button onClick={() => void saveBindings()} disabled={bindingIds.length === 0}>保存排序</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(createdKey)} onOpenChange={() => setCreatedKey('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>密钥已创建</DialogTitle>
            <DialogDescription>请妥善保存密钥，或直接导入 CC Switch 使用。</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border/70 bg-muted/25 p-4 font-mono text-xs break-all">
            {createdKey}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedKey('')}>
              关闭
            </Button>
            <Button onClick={() => copyText(createdKey)}>复制密钥</Button>
            <CCSwitchImport keys={[{ id: "new", name: "刚创建的密钥", key: createdKey }]} selectedId="new" />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteId !== undefined}
        onOpenChange={() => setPendingDeleteId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确认永久删除该 API Key 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}



function KeyGroupSummary({ item }: { item: ApiKeyRecord }) {
  const [open, setOpen] = useState(false)
  const ordered = [...(item.model_groups ?? [])].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  const labels = ordered.map(binding => [binding.group?.model_provider, binding.group?.name || binding.group?.code || binding.group_id].filter(Boolean).join(' · '))
  if (!ordered.length) return item.needs_group_binding ? <Badge variant="destructive">需要配置分组</Badge> : <span className="text-muted-foreground">—</span>
  return <TooltipProvider delayDuration={150}><Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger asChild>
      <button type="button" className="flex h-7 w-52 max-w-52 items-center gap-1.5 rounded-md text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring" aria-label={'查看全部 ' + ordered.length + ' 个模型分组及优先顺序'} onClick={event => { event.preventDefault(); setOpen(value => !value) }}>
        <Badge variant="outline" className="min-w-0 max-w-full"><span className="truncate">{labels[0]}</span></Badge>
        {ordered.length > 1 ? <span className="shrink-0 text-xs font-medium text-primary">+{ordered.length - 1}</span> : null}
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" align="start" sideOffset={8} className="max-w-[min(24rem,calc(100vw-2rem))] flex-col items-start gap-2 p-3">
      <p className="font-semibold">模型分组（{ordered.length} 个）· 优先顺序</p>
      <ol className="flex max-h-64 w-full flex-col gap-1.5 overflow-y-auto whitespace-normal">
        {labels.map((label, index) => <li key={index} className="flex items-start gap-2"><span className="shrink-0 font-mono">{index + 1}.</span><span className="min-w-0 [overflow-wrap:anywhere]">{label}</span></li>)}
      </ol>
    </TooltipContent>
  </Tooltip></TooltipProvider>
}
