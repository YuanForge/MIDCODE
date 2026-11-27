import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminOcpcPlatform } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { PlatformDialog } from '@/pages/admin/ocpc/PlatformDialog'
import { PlatformsTable } from '@/pages/admin/ocpc/PlatformsTable'
import { SchedulePanel } from '@/pages/admin/ocpc/SchedulePanel'
import { emptyForm, formFromRow, toPayload, type PlatformForm } from '@/pages/admin/ocpc/platformForm'

/** Promotion accounts on Baidu and 360, plus the schedule that reports conversions to them. */
export function AdminOcpcPage() {
  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const [platformRes, scheduleRes] = await Promise.all([adminApi.listOcpcPlatforms(), adminApi.getOcpcSchedule()])
    const platforms = Array.isArray(platformRes) ? platformRes : platformRes.list ?? []
    const schedule = scheduleRes.schedule ?? {}
    return {
      platforms,
      scheduleEnabled: schedule.ocpc_schedule_enabled === 'true',
      scheduleInterval: schedule.ocpc_schedule_interval ?? '30',
    }
  }, { platforms: [] as AdminOcpcPlatform[], scheduleEnabled: false, scheduleInterval: '30' })

  const [mutError, setMutError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AdminOcpcPlatform | null>(null)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<PlatformForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // The schedule shows what was loaded until the person changes it.
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean | null>(null)
  const [scheduleInterval, setScheduleInterval] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState('')
  const [uploading, setUploading] = useState(false)

  const effectiveEnabled = scheduleEnabled ?? data.scheduleEnabled
  const effectiveInterval = scheduleInterval ?? data.scheduleInterval
  const error = loadError || mutError

  function updateField<K extends keyof PlatformForm>(key: K, value: PlatformForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openCreate() {
    setForm(emptyForm)
    setFormError('')
    setOpen(true)
  }

  function openEdit(row: AdminOcpcPlatform) {
    setForm(formFromRow(row))
    setFormError('')
    setOpen(true)
  }

  async function savePlatform() {
    setSaving(true)
    setFormError('')
    try {
      if (form.id) {
        await adminApi.updateOcpcPlatform(form.id, toPayload(form))
      } else {
        await adminApi.createOcpcPlatform(toPayload(form))
      }
      setOpen(false)
      reload()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function togglePlatform(row: AdminOcpcPlatform) {
    if (!row.id) return
    setMutError('')
    try {
      await adminApi.toggleOcpcPlatform(row.id)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  async function executeDelete() {
    const target = pendingDelete
    if (!target?.id) return
    setMutError('')
    try {
      await adminApi.deleteOcpcPlatform(target.id)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingDelete(null)
    }
  }

  async function saveSchedule() {
    setMutError('')
    try {
      await adminApi.updateOcpcSchedule({ enabled: effectiveEnabled, interval: Number(effectiveInterval) })
      toast.success('调度已保存')
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  async function triggerUpload() {
    setUploading(true)
    setMutError('')
    try {
      const result = await adminApi.triggerOcpcUpload()
      setUploadResult(JSON.stringify(result, null, 2))
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <PageHeader
        title='推广账户管理'
        description='平台账户配置、手动上报和定时调度。'
        actions={
          <>
            {error ? (
              <Button variant='outline' onClick={reload}>
                重试
              </Button>
            ) : null}
            <Button onClick={openCreate}>
              <PlusIcon data-icon='inline-start' />
              新增账户
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PlatformsTable platforms={data.platforms} loading={loading} onEdit={openEdit} onToggle={(row) => void togglePlatform(row)} onDelete={setPendingDelete} />

      <SchedulePanel
        enabled={effectiveEnabled}
        onEnabled={setScheduleEnabled}
        interval={effectiveInterval}
        onInterval={setScheduleInterval}
        onSave={() => void saveSchedule()}
        onUpload={() => void triggerUpload()}
        uploading={uploading}
        result={uploadResult}
      />

      <PlatformDialog open={open} form={form} onField={updateField} error={formError} saving={saving} onOpenChange={setOpen} onSubmit={() => void savePlatform()} />
      <ConfirmAction
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title='确认删除'
        description={`确认删除 OCPC 账户 ${pendingDelete?.name ?? pendingDelete?.id ?? ''} 吗？此操作不可撤销。`}
        confirmLabel='删除'
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
