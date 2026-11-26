import { TextField } from '@/components/shared/TextField'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AdminUpstreamPlatform } from '@/lib/api/admin'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { formatBillingSummary } from '@/pages/admin/channels/channelFormat'
import { CheckField, Hint, SelectField, type GateField, type SetField } from '@/pages/admin/channels/fields'
import type { UpstreamCost } from '@/pages/admin/channels/useUpstreamCost'

/** Binds the channel to an upstream price list: pick the platform, detect the cost, sync it, then optionally keep it in sync. */
export function UpstreamCostPanel({
  form,
  set,
  gate,
  platforms,
  cost,
}: {
  form: ChannelForm
  set: SetField
  gate: GateField
  platforms: AdminUpstreamPlatform[]
  cost: UpstreamCost
}) {
  const { preview } = cost
  const platform = platforms.find((item) => String(item.id) === form.upstream_platform_id)

  return (
    <>
      <div className='flex flex-wrap items-center gap-2 sm:col-span-2'>
        <StatusBadge tone={form.upstream_cost_auto_sync ? 'success' : 'neutral'}>{form.upstream_cost_auto_sync ? '自动同步中' : '未开启自动同步'}</StatusBadge>
        {preview ? (
          <>
            <StatusBadge tone={preview.found ? 'success' : 'warning'}>{preview.found ? '模型存在' : '未找到模型'}</StatusBadge>
            <StatusBadge tone={preview.price_available ? 'success' : 'neutral'}>{preview.price_available ? '可同步成本' : '无公开成本'}</StatusBadge>
            <StatusBadge tone={preview.base_url_match === false ? 'warning' : 'info'}>{preview.base_url_match === false ? 'URL 未匹配' : 'URL 已匹配'}</StatusBadge>
          </>
        ) : null}
      </div>
      <Hint wide>按当前渠道的标准模型名从上游价表读取成本；检测不会修改渠道配置。</Hint>

      <SelectField id='upstream-platform' wide label='上游平台' value={form.upstream_platform_id} onChange={(value) => gate({ upstream_platform_id: value })}>
        <option value=''>不绑定</option>
        {platforms.map((item) => (
          <option key={item.id} value={String(item.id)}>
            #{item.id} {item.name} ({item.base_url})
          </option>
        ))}
      </SelectField>
      <TextField id='upstream-model' label='上游模型名' value={form.upstream_model} onChange={(value) => gate({ upstream_model: value })} placeholder={form.model || '留空使用标准模型名'} />
      <TextField id='upstream-group' label='上游分组（可选）' value={form.upstream_group} onChange={(value) => gate({ upstream_group: value })} placeholder='留空使用基础价' />

      <div className='flex flex-wrap items-center gap-2 sm:col-span-2'>
        <Button type='button' variant='outline' disabled={!form.id || !form.upstream_platform_id || cost.detecting} onClick={() => void cost.detect()}>
          {cost.detecting ? '检测中…' : '检测成本'}
        </Button>
        <Button type='button' disabled={!form.id || !form.upstream_platform_id || !cost.previewOk || cost.syncing} onClick={() => void cost.sync()}>
          {cost.syncing ? '同步中…' : '同步成本'}
        </Button>
        {!form.id ? <span className='text-xs text-muted-foreground'>先保存渠道，才能检测和同步上游成本。</span> : null}
      </div>

      <CheckField
        id='upstream-auto-sync'
        wide
        label='自动同步上游成本'
        hint={cost.autoSyncHint}
        checked={form.upstream_cost_auto_sync}
        disabled={cost.autoSyncDisabled}
        onChange={(next) => set('upstream_cost_auto_sync', next)}
      />

      {platform ? (
        <Hint wide>
          当前上游：{platform.name} · {platform.base_url}
        </Hint>
      ) : null}
      {preview?.billing_config ? <Hint wide>预览：{formatBillingSummary(preview.billing_type, preview.billing_config, 'cost')}</Hint> : null}
    </>
  )
}
