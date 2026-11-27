import { useEffect, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminUpstreamPlatform } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { PlatformDialog } from '@/pages/admin/upstream/PlatformDialog'
import { PlatformsTable } from '@/pages/admin/upstream/PlatformsTable'
import { buildPlatformPayload, defaultForm, formFromPlatform, type PlatformForm } from '@/pages/admin/upstream/platformForm'

/** Upstream accounts and their balances, refreshed every 10 seconds while the page is open. */
export function AdminUpstreamPage() {
  const { data: platforms, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listUpstreamPlatforms()
    return res.platforms ?? []
  }, [] as AdminUpstreamPlatform[], [])

  const [mutError, setMutError] = useState('')
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminUpstreamPlatform | null>(null)

  const [editing, setEditing] = useState<AdminUpstreamPlatform | null>(null)
  const [form, setForm] = useState<PlatformForm>(defaultForm)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => reload(), 10_000)
    return () => window.clearInterval(timer)
  }, [reload])

  function updateField<K extends keyof PlatformForm>(key: K, value: PlatformForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openCreate() {
    setEditing({})
    setForm(defaultForm)
    setSaveError('')
  }

  function openEdit(platform: AdminUpstreamPlatform) {
    setEditing(platform)
    setForm(formFromPlatform(platform))
    setSaveError('')
  }

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      const payload = buildPlatformPayload(form)
      if (editing?.id) {
        await adminApi.updateUpstreamPlatform(editing.id, payload)
      } else {
        await adminApi.createUpstreamPlatform(payload)
      }
      setEditing(null)
      reload()
    } catch (err) {
      setSaveError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function executeDelete() {
    const target = pendingDelete
    if (!target?.id) return
    setMutError('')
    try {
      await adminApi.deleteUpstreamPlatform(target.id)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingDelete(null)
    }
  }

  async function syncBalance(platform: AdminUpstreamPlatform) {
    if (!platform.id) return
    setSyncingId(platform.id)
    try {
      await adminApi.syncUpstreamBalance(platform.id)
      toast.success('余额已同步')
      reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setSyncingId(null)
    }
  }

  const shownError = error || mutError

  return (
    <>
      <PageHeader
        title='上游平台'
        description='维护上游账户和余额检测凭据；后台每 10 秒自动同步余额并按阈值推送 Lark 告警。'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            添加平台
          </Button>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <PlatformsTable
        platforms={platforms}
        loading={loading}
        syncingId={syncingId}
        onSync={(platform) => void syncBalance(platform)}
        onEdit={openEdit}
        onDelete={setPendingDelete}
      />

      <PlatformDialog
        open={editing !== null}
        isEdit={Boolean(editing?.id)}
        form={form}
        onField={updateField}
        error={saveError}
        saving={saving}
        onOpenChange={(next) => {
          if (!next) setEditing(null)
        }}
        onSubmit={() => void save()}
      />
      <ConfirmAction
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title='确认删除'
        description={`确认删除上游平台「${pendingDelete?.name ?? ''}」吗？此操作无法撤销。`}
        confirmLabel='确认删除'
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
