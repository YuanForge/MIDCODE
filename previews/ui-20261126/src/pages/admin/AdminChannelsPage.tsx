import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannel, type AdminKeyPool, type AdminModelProvider, type AdminUpstreamPlatform } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { useReportRows } from '@/lib/console-status'
import { BatchWeightDialog } from '@/pages/admin/channels/BatchWeightDialog'
import { ChannelBatchBar } from '@/pages/admin/channels/ChannelBatchBar'
import { ChannelDialog } from '@/pages/admin/channels/ChannelDialog'
import { ChannelFilters } from '@/pages/admin/channels/ChannelFilters'
import { emptyForm, type ChannelForm } from '@/pages/admin/channels/channelForm'
import { ChannelLogDialog } from '@/pages/admin/channels/ChannelLogDialog'
import { ChannelsTable, type RowActions } from '@/pages/admin/channels/ChannelsTable'
import { CHANNEL_PAGE_SIZE, buildChannelParams, emptyChannelFilters, type ChannelFilterState } from '@/pages/admin/channels/filters'
import { buildFormFromChannel } from '@/pages/admin/channels/formFromChannel'

/** Channels as a ruled ledger. Editing, logs, batch weight and deleting are dialogs on top of it, and each keeps its own errors. */
export function AdminChannelsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<ChannelFilterState>(emptyChannelFilters)
  const [query, setQuery] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const [channelResponse, poolResponse, upstreamResponse, providersResponse] = await Promise.all([
      adminApi.listChannels({ page, size: CHANNEL_PAGE_SIZE, ...query }),
      adminApi.listKeyPools(),
      adminApi.listUpstreamPlatforms(),
      adminApi.listModelProviders(true),
    ])
    const found = Array.isArray(channelResponse) ? channelResponse : channelResponse.channels ?? channelResponse.items ?? []
    const total = Array.isArray(channelResponse) ? found.length : channelResponse.total ?? found.length
    const pools = Array.isArray(poolResponse) ? poolResponse : poolResponse.pools ?? []
    const providers = providersResponse.providers ?? []
    // A channel stores its provider as an id. The name shown in the table comes from the catalog.
    const names = new Map(providers.map((provider) => [provider.id, provider.name] as const))
    const rows = found.map((row) => ({ ...row, model_provider: row.model_provider || names.get(row.model_provider_id ?? 0) }))
    return { rows, pools, platforms: upstreamResponse.platforms ?? [], providers, total }
  }, { rows: [] as AdminChannel[], pools: [] as AdminKeyPool[], platforms: [] as AdminUpstreamPlatform[], providers: [] as AdminModelProvider[], total: 0 }, [page, query])

  const [pageError, setPageError] = useState('')
  const [editing, setEditing] = useState<ChannelForm | null>(null)
  const [logChannel, setLogChannel] = useState<AdminChannel | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminChannel | null>(null)
  const [weightOpen, setWeightOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useReportRows(data.rows.length, loading)
  const error = loadError || pageError
  const activeProviders = data.providers.filter((provider) => provider.is_active !== false)
  const ids = data.rows.map((row) => row.id).filter((id): id is number => id != null)
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))

  function field<K extends keyof ChannelFilterState>(key: K, next: ChannelFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: next }))
  }

  // A new search or page means the ticked rows are no longer on screen, so the ticks go.
  function search(params: Record<string, string>) {
    setSelected(new Set())
    setPage(1)
    setQuery(params)
  }

  function goPage(next: number) {
    setSelected(new Set())
    setPage(next)
  }

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Runs one request for the page, reloads the list after it, and reports a failure in the page's alert. */
  async function run(task: () => Promise<unknown>, success?: string): Promise<boolean> {
    setPageError('')
    try {
      await task()
      if (success) toast.success(success)
      reload()
      return true
    } catch (err) {
      setPageError(getApiErrorMessage(err))
      return false
    }
  }

  async function batchToggle(isActive: boolean) {
    setBusy(true)
    const ok = await run(() => adminApi.batchUpdateChannels({ action: 'toggle_active', ids: Array.from(selected), is_active: isActive }), isActive ? '已批量启用' : '已批量停用')
    if (ok) setSelected(new Set())
    setBusy(false)
  }

  async function executeDelete() {
    const id = pendingDelete?.id
    if (id != null) await run(() => adminApi.deleteChannel(id), '渠道已删除')
  }

  const actions: RowActions = {
    stats: (row) => {
      if (row.id != null) navigate(`/admin/channels/${row.id}/token-stats${location.search}`)
    },
    edit: (row) => setEditing(buildFormFromChannel(row)),
    copy: (row) => setEditing(buildFormFromChannel(row, true)),
    log: setLogChannel,
    refresh: (row) => {
      const id = row.id
      if (id != null) void run(() => adminApi.refreshChannelRuntime(id), 'Redis 状态已刷新')
    },
    toggle: (row) => {
      const id = row.id
      if (id == null) return
      const enable = row.is_active === false
      void run(() => adminApi.toggleChannel(id, enable), enable ? '渠道已启用' : '渠道已停用')
    },
    remove: setPendingDelete,
  }

  return (
    <>
      <PageHeader
        title='渠道管理'
        description='管理 API 渠道，支持认证、计费、脚本、轮询、号池和负载参数。'
        actions={
          <div className='flex items-center gap-2'>
            {loadError ? (
              <Button variant='outline' onClick={reload}>
                重试
              </Button>
            ) : null}
            <Button onClick={() => setEditing(emptyForm)}>
              <PlusIcon data-icon='inline-start' />
              新增渠道
            </Button>
          </div>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ChannelFilters
        value={filters}
        onField={field}
        onSearch={() => search(buildChannelParams(filters))}
        onReset={() => {
          setFilters(emptyChannelFilters)
          search({})
        }}
      />

      {selected.size > 0 ? (
        <ChannelBatchBar
          count={selected.size}
          busy={busy}
          onEnable={() => void batchToggle(true)}
          onDisable={() => void batchToggle(false)}
          onWeight={() => setWeightOpen(true)}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      <ChannelsTable
        rows={data.rows}
        loading={loading}
        page={page}
        total={data.total}
        onPage={goPage}
        selected={selected}
        allSelected={allSelected}
        onToggle={toggle}
        onToggleAll={() => setSelected(allSelected ? new Set() : new Set(ids))}
        actions={actions}
      />

      {editing ? (
        <ChannelDialog
          initial={editing}
          providers={data.providers}
          activeProviders={activeProviders}
          pools={data.pools}
          platforms={data.platforms}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
          onSynced={reload}
        />
      ) : null}
      <ChannelLogDialog channel={logChannel} onClose={() => setLogChannel(null)} />
      {weightOpen ? (
        <BatchWeightDialog
          ids={Array.from(selected)}
          onClose={() => setWeightOpen(false)}
          onDone={() => {
            setWeightOpen(false)
            setSelected(new Set())
            reload()
          }}
        />
      ) : null}
      <ConfirmAction
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title='确认删除'
        description={`确认删除渠道“${pendingDelete?.name ?? pendingDelete?.model ?? pendingDelete?.id}”吗？此操作不可撤销。`}
        confirmLabel='删除'
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
