import { useState } from 'react'
import { SaveIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminApi, type AdminKeyPool, type AdminModelProvider, type AdminUpstreamPlatform } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { AuthTab } from '@/pages/admin/channels/AuthTab'
import { BasicTab } from '@/pages/admin/channels/BasicTab'
import { BillingTab } from '@/pages/admin/channels/BillingTab'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { buildChannelPayload, validateChannelForm } from '@/pages/admin/channels/channelPayload'
import type { SetField } from '@/pages/admin/channels/fields'
import { ScriptsTab } from '@/pages/admin/channels/ScriptsTab'
import { useUpstreamCost } from '@/pages/admin/channels/useUpstreamCost'

const PANE = 'mt-5 max-h-[62vh] overflow-y-auto pr-1'

/** Create, edit or copy one channel. Mounted only while open, so the form and the cost checks start fresh every time. */
export function ChannelDialog({
  initial,
  providers,
  activeProviders,
  pools,
  platforms,
  onClose,
  onSaved,
  onSynced,
}: {
  initial: ChannelForm
  providers: AdminModelProvider[]
  activeProviders: AdminModelProvider[]
  pools: AdminKeyPool[]
  platforms: AdminUpstreamPlatform[]
  onClose: () => void
  onSaved: () => void
  onSynced: () => void
}) {
  const [form, setForm] = useState<ChannelForm>(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const cost = useUpstreamCost({ form, setForm, onError: setError, onSynced })
  const set: SetField = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  async function save() {
    const problem = validateChannelForm(form)
    if (problem) {
      setError(problem)
      return
    }
    if (form.upstream_cost_auto_sync && !cost.autoSyncReady) {
      setError('请先检测成本成功，并同步成本成功后再开启自动同步')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = buildChannelPayload(form)
      if (form.id) await adminApi.updateChannel(form.id, payload)
      else await adminApi.createChannel(payload)
      onSaved()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent className='sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>{form.id ? '编辑渠道' : '新增渠道'}</DialogTitle>
          <DialogDescription>覆盖上游接入所需的核心字段。</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue='basic'>
          <TabsList className='w-full'>
            <TabsTrigger value='basic'>基本信息</TabsTrigger>
            <TabsTrigger value='auth'>认证 &amp; 号池</TabsTrigger>
            <TabsTrigger value='billing'>计费</TabsTrigger>
            <TabsTrigger value='scripts'>脚本 &amp; 轮询</TabsTrigger>
          </TabsList>
          <TabsContent value='basic' className={PANE}>
            <BasicTab form={form} set={set} gate={cost.resetGate} providers={providers} activeProviders={activeProviders} />
          </TabsContent>
          <TabsContent value='auth' className={PANE}>
            <AuthTab form={form} set={set} pools={pools} />
          </TabsContent>
          <TabsContent value='billing' className={PANE}>
            <BillingTab form={form} set={set} gate={cost.resetGate} platforms={platforms} cost={cost} />
          </TabsContent>
          <TabsContent value='scripts' className={PANE}>
            <ScriptsTab form={form} set={set} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            <SaveIcon data-icon='inline-start' />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
