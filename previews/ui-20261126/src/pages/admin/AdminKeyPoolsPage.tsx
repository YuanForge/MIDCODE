import { useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannel, type AdminKeyPool } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { BindChannelsDialog } from '@/pages/admin/keypools/BindChannelsDialog'
import { CreatePoolDialog } from '@/pages/admin/keypools/CreatePoolDialog'
import { PoolKeysDialog } from '@/pages/admin/keypools/PoolKeysDialog'
import { PoolsTable } from '@/pages/admin/keypools/PoolsTable'

/** Key pools as a ruled ledger. Creating, managing keys and binding channels are dialogs on top of it; deleting a pool asks first. */
export function AdminKeyPoolsPage() {
  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const [poolResponse, channelResponse] = await Promise.all([adminApi.listKeyPools(), adminApi.listChannels()])
    const pools = Array.isArray(poolResponse) ? poolResponse : poolResponse.pools ?? []
    const channels = (Array.isArray(channelResponse) ? channelResponse : channelResponse.channels ?? channelResponse.items ?? []).filter(
      (item: AdminChannel) => item?.id,
    )
    return { pools, channels }
  }, { pools: [] as AdminKeyPool[], channels: [] as AdminChannel[] })

  const { pools, channels } = data
  const [mutError, setMutError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AdminKeyPool | null>(null)
  const [keysPool, setKeysPool] = useState<AdminKeyPool | null>(null)
  const [bindPool, setBindPool] = useState<AdminKeyPool | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [channelId, setChannelId] = useState<string | null>(null)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  // Until the person picks one, the new pool starts on the first channel.
  const channelValue = channelId ?? String(channels[0]?.id ?? '')
  const error = loadError || mutError

  async function act(run: () => Promise<unknown>) {
    setMutError('')
    try {
      await run()
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  function openCreate() {
    setName('')
    setChannelId(null)
    setCreateError('')
    setCreateOpen(true)
  }

  async function createPool() {
    setCreating(true)
    setCreateError('')
    try {
      await adminApi.createKeyPool({ ...(channelValue ? { channel_id: Number(channelValue) } : {}), name: name.trim() })
      setCreateOpen(false)
      reload()
    } catch (err) {
      setCreateError(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  function togglePool(pool: AdminKeyPool) {
    const id = pool.id
    if (!id) return
    void act(() => adminApi.toggleKeyPool(id))
  }

  function toggleVendor(pool: AdminKeyPool) {
    const id = pool.id
    if (!id) return
    void act(() => adminApi.toggleVendorSubmittable(id))
  }

  async function executeDelete() {
    const id = pendingDelete?.id
    setPendingDelete(null)
    if (!id) return
    await act(() => adminApi.deleteKeyPool(id))
  }

  return (
    <>
      <PageHeader
        title='号池管理'
        description='管理号池、启停、切换号商上传，以及管理池内 Key。'
        actions={
          <>
            {error ? (
              <Button variant='outline' onClick={reload}>
                重试
              </Button>
            ) : null}
            <Button onClick={openCreate}>
              <PlusIcon data-icon='inline-start' />
              新建号池
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PoolsTable
        pools={pools}
        loading={loading}
        onKeys={setKeysPool}
        onBind={setBindPool}
        onToggle={togglePool}
        onToggleVendor={toggleVendor}
        onDelete={setPendingDelete}
      />

      <CreatePoolDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        channels={channels}
        channelId={channelValue}
        onChannelId={setChannelId}
        name={name}
        onName={setName}
        error={createError}
        submitting={creating}
        onSubmit={() => void createPool()}
      />
      {keysPool ? <PoolKeysDialog key={keysPool.id} pool={keysPool} onClose={() => setKeysPool(null)} /> : null}
      {bindPool ? <BindChannelsDialog key={bindPool.id} pool={bindPool} channels={channels} onClose={() => setBindPool(null)} onSaved={reload} /> : null}
      <ConfirmAction
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title='确认删除'
        description={`确认删除号池 ${pendingDelete?.name ?? pendingDelete?.id ?? ''} 吗？此操作不可撤销。`}
        confirmLabel='删除'
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
