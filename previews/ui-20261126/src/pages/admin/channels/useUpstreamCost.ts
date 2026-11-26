import { useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'

import { adminApi, type AdminChannelUpstreamCostPreview } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { buildUpstreamCostPayload } from '@/pages/admin/channels/channelPayload'
import { buildFormFromChannel } from '@/pages/admin/channels/formFromChannel'

/**
 * Cost detection and sync for one channel being edited.
 * Auto-sync may only be switched on after a successful detection and a successful sync, and changing anything
 * the price list depends on (platform, model, group, markup) closes that gate again.
 */
export function useUpstreamCost({
  form,
  setForm,
  onError,
  onSynced,
}: {
  form: ChannelForm
  setForm: Dispatch<SetStateAction<ChannelForm>>
  onError: (message: string) => void
  onSynced: () => void
}) {
  const [preview, setPreview] = useState<AdminChannelUpstreamCostPreview | null>(null)
  // A channel that already syncs has passed both checks before.
  const [previewOk, setPreviewOk] = useState(form.upstream_cost_auto_sync)
  const [syncOk, setSyncOk] = useState(form.upstream_cost_auto_sync)
  const [detecting, setDetecting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const autoSyncReady = previewOk && syncOk
  const autoSyncDisabled = !form.upstream_cost_auto_sync && (!form.id || !form.upstream_platform_id || !autoSyncReady)
  const autoSyncHint = form.upstream_cost_auto_sync
    ? '已开启；每 10 秒检测一次，上游成本变化时自动同步。修改上游平台、模型、分组或利润倍数后需要重新检测并同步。'
    : autoSyncReady
      ? '检测和同步都已成功；如已手动关闭，可重新勾选开启自动同步。'
      : previewOk
        ? '请先同步成本成功后再开启自动同步。'
        : '请先检测成本成功，再同步成本后开启自动同步。'

  function resetGate(patch: Partial<ChannelForm>) {
    setPreview(null)
    setPreviewOk(false)
    setSyncOk(false)
    setForm((current) => ({ ...current, ...patch, upstream_cost_auto_sync: false }))
  }

  async function detect() {
    if (!form.id) {
      onError('请先保存渠道，再检测上游成本')
      return
    }
    const payload = buildUpstreamCostPayload(form)
    if (!payload.platform_id) {
      onError('请选择上游平台')
      return
    }
    setDetecting(true)
    onError('')
    try {
      const result = await adminApi.previewChannelUpstreamCost(form.id, payload)
      const ok = Boolean(result.found && result.price_available)
      setPreview(result)
      setPreviewOk(ok)
      setSyncOk(false)
      setForm((current) => ({ ...current, upstream_cost_auto_sync: false }))
      if (!result.found) {
        toast.error('上游未找到当前模型')
      } else if (!result.price_available) {
        toast.warning('上游模型存在，但没有可同步公开成本')
      } else {
        toast.success('已获取上游成本')
      }
    } catch (err) {
      onError(getApiErrorMessage(err))
    } finally {
      setDetecting(false)
    }
  }

  async function sync() {
    if (!form.id) {
      onError('请先保存渠道，再同步上游成本')
      return
    }
    const payload = buildUpstreamCostPayload(form)
    if (!payload.platform_id) {
      onError('请选择上游平台')
      return
    }
    if (!previewOk) {
      onError('请先检测成本成功后再同步成本')
      return
    }
    setSyncing(true)
    onError('')
    try {
      const result = await adminApi.syncChannelUpstreamCost(form.id, payload)
      const ok = Number(result.price_synced ?? 0) > 0
      const channel = result.channel
      if (channel) {
        // The server has saved the channel, so the form takes the saved values.
        setForm({ ...buildFormFromChannel(channel), upstream_cost_auto_sync: ok })
      } else {
        setForm((current) => ({ ...current, upstream_cost_auto_sync: ok }))
      }
      setPreview((current) => ({
        ...(current ?? {}),
        ...result,
        found: true,
        price_available: ok,
        price_unavailable: !ok,
      }))
      setPreviewOk(ok)
      setSyncOk(ok)
      toast.success(ok ? '渠道成本已同步，自动同步已开启' : '渠道已绑定上游，暂无可同步公开成本')
      onSynced()
    } catch (err) {
      onError(getApiErrorMessage(err))
    } finally {
      setSyncing(false)
    }
  }

  return { preview, previewOk, detecting, syncing, autoSyncReady, autoSyncDisabled, autoSyncHint, resetGate, detect, sync }
}

export type UpstreamCost = ReturnType<typeof useUpstreamCost>
