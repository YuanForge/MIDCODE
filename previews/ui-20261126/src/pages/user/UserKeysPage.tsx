import { useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { userApi, type ApiKeyModelGroup, type ApiKeyRecord } from '@/lib/api/user'
import { copyToClipboard } from '@/lib/clipboard'
import { BindingsDialog } from '@/pages/user/keys/BindingsDialog'
import { CreatedKeyDialog } from '@/pages/user/keys/CreatedKeyDialog'
import { CreateKeyDialog } from '@/pages/user/keys/CreateKeyDialog'
import { DeleteKeyDialog } from '@/pages/user/keys/DeleteKeyDialog'
import { KeyTable } from '@/pages/user/keys/KeyTable'

/** The ids of a key's model groups, in call order. */
function orderedGroupIds(item?: ApiKeyRecord) {
  return (item?.model_groups ?? [])
    .slice()
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((group) => group.group_id ?? 0)
    .filter(Boolean)
}

/** API keys: the ledger of keys, with create, edit-groups and delete as dialogs on top of it. */
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
  const [createError, setCreateError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [bindingKey, setBindingKey] = useState<ApiKeyRecord>()
  const [bindingIds, setBindingIds] = useState<number[]>([])
  const [bindingError, setBindingError] = useState('')
  const [bindingSaving, setBindingSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | undefined>()

  // A key can still be bound to a group that is no longer offered, so the editor merges those bindings in.
  const bindingGroups = useMemo(() => {
    const merged = new Map(availableGroups.flatMap((group) => (group.id ? [[group.id, group] as const] : [])))
    for (const binding of bindingKey?.model_groups ?? []) {
      if (binding.group_id && binding.group) merged.set(binding.group_id, binding.group)
    }
    return [...merged.values()]
  }, [availableGroups, bindingKey])

  // Saving the groups a key already has would change nothing, so the dialog waits for a real change.
  const savedIds = orderedGroupIds(bindingKey)
  const bindingUnchanged = bindingIds.length === savedIds.length && bindingIds.every((id, index) => id === savedIds[index])

  const error = loadError || mutError

  function openCreate() {
    setCreateError('')
    setCreateOpen(true)
  }

  async function handleCreate() {
    if (!newKeyName.trim()) {
      setCreateError('请输入密钥名称')
      return
    }
    if (selectedGroupIds.length === 0) {
      setCreateError('请至少选择一个模型分组')
      return
    }
    setSubmitting(true)
    setCreateError('')
    try {
      const response = await userApi.createApiKey(newKeyName.trim(), selectedGroupIds)
      setCreatedKey(String((response as { key?: string }).key ?? ''))
      setCreateOpen(false)
      setNewKeyName('')
      setSelectedGroupIds([])
      reload()
    } catch (err) {
      setCreateError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  function openBindings(item: ApiKeyRecord) {
    setBindingError('')
    setBindingKey(item)
    setBindingIds(orderedGroupIds(item))
  }

  async function saveBindings() {
    if (!bindingKey?.id || bindingIds.length === 0 || bindingSaving) return
    setBindingError('')
    setBindingSaving(true)
    try {
      await userApi.replaceApiKeyModelGroups(bindingKey.id, bindingIds)
      toast.success(`已更新「${bindingKey.name || '未命名'}」的模型分组`)
      setBindingKey(undefined)
      reload()
    } catch (err) {
      setBindingError(getApiErrorMessage(err))
    } finally {
      setBindingSaving(false)
    }
  }

  async function executeDelete() {
    if (!pendingDeleteId) return
    setMutError('')
    try {
      await userApi.deleteApiKey(pendingDeleteId)
      reload()
    } catch (err) {
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
        title='API 密钥'
        description='管理用于 API 调用鉴权的密钥。完整密钥只在创建时展示一次。'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            新建密钥
          </Button>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <KeyTable keys={keys} loading={loading} onBind={openBindings} onDelete={setPendingDeleteId} />

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        name={newKeyName}
        onNameChange={setNewKeyName}
        groups={availableGroups}
        selectedIds={selectedGroupIds}
        onSelectedChange={setSelectedGroupIds}
        error={createError}
        submitting={submitting}
        onSubmit={() => void handleCreate()}
      />
      <BindingsDialog
        open={Boolean(bindingKey)}
        keyName={bindingKey?.name}
        onClose={() => setBindingKey(undefined)}
        groups={bindingGroups}
        ids={bindingIds}
        onIdsChange={setBindingIds}
        unchanged={bindingUnchanged}
        error={bindingError}
        saving={bindingSaving}
        onSave={() => void saveBindings()}
      />
      <CreatedKeyDialog createdKey={createdKey} onClose={() => setCreatedKey('')} onCopy={copyText} />
      <DeleteKeyDialog
        open={pendingDeleteId !== undefined}
        onClose={() => setPendingDeleteId(undefined)}
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
