import { useMemo, useState } from 'react'
import { KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { FilterBar } from '@/components/shared/FilterBar'
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
import { Badge } from '@/components/ui/badge'
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
        eyebrow="Security"
        title="API 密钥"
        description="管理用于 API 调用鉴权的密钥，创建后的完整密钥只会展示一次。"
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
      <FilterBar filters={<p className="text-sm text-muted-foreground">共 {keys.length} 个密钥</p>} />
      {loading ? (
        <Card className="overflow-hidden">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>模型分组</TableHead>
                <TableHead className="text-right">今日消耗</TableHead>
                <TableHead className="text-right">累计消耗</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableSkeleton cols={7} rows={3} />
          </Table>
        </Card>
      ) : keys.length === 0 ? (
        <Card className="overflow-hidden">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>模型分组</TableHead>
                <TableHead className="text-right">今日消耗</TableHead>
                <TableHead className="text-right">累计消耗</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableEmpty
                cols={7}
                Icon={KeyRoundIcon}
                title="还没有 API 密钥"
                description="点击右上角「新建密钥」即可创建，生成后的完整密钥只会展示一次。"
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
                <TableHead>Key</TableHead>
                <TableHead>模型分组</TableHead>
                <TableHead className="text-right">今日消耗</TableHead>
                <TableHead className="text-right">累计消耗</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((item, index) => (
                <TableRow key={item.id ?? index}>
                  <TableCell className="font-medium">{item.name ?? '未命名'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.viewable
                      ? (item.raw_key ?? item.key ?? '***')
                      : item.key_prefix
                        ? `${item.key_prefix}...`
                        : (item.masked_key ?? '***')}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {(item.model_groups ?? []).map((binding) => (
                        <Badge key={binding.group_id} variant="outline">
                          {binding.group?.model_provider ? `${binding.group.model_provider} · ` : ''}{binding.group?.name || binding.group?.code || binding.group_id}
                        </Badge>
                      ))}
                      {item.needs_group_binding ? <Badge variant="destructive">需要配置分组</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <span
                      className={
                        (item.today_consumed ?? 0) > 0
                          ? 'font-semibold text-destructive'
                          : 'text-muted-foreground'
                      }
                    >
                      {spendText(item.today_consumed)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <span
                      className={
                        (item.total_consumed ?? 0) > 0
                          ? 'font-semibold text-destructive'
                          : 'text-muted-foreground'
                      }
                    >
                      {spendText(item.total_consumed)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.is_active === false ? 'secondary' : 'default'}>
                      {item.is_active === false ? '停用' : '启用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>创建 API 密钥</DialogTitle>
            <DialogDescription>
              创建后会返回一次性明文，关闭后只能看到遮罩形式。
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
            <DialogDescription>请立即复制保存，这个明文值后续不会再次展示。</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border/70 bg-muted/25 p-4 font-mono text-xs break-all">
            {createdKey}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedKey('')}>
              关闭
            </Button>
            <Button onClick={() => copyText(createdKey)}>复制密钥</Button>
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


