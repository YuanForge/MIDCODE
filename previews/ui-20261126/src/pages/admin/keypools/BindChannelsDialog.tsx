import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannel, type AdminKeyPool } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { boundChannelLabel } from '@/pages/admin/keypools/poolFormat'

/**
 * Choose which channels a pool serves. The page mounts this only while a pool is open.
 * The ticks shown are what the server has until the person changes one, so nothing is copied in by an effect.
 */
export function BindChannelsDialog({
  pool,
  channels,
  onClose,
  onSaved,
}: {
  pool: AdminKeyPool
  channels: AdminChannel[]
  onClose: () => void
  onSaved: () => void
}) {
  const poolId = pool.id as number
  const { data: bound, loading, error: loadError } = useAsync(async () => {
    const res = await adminApi.getKeyPoolChannels(poolId)
    return (res.channels ?? []).map((channel) => channel.id).filter((id): id is number => Boolean(id))
  }, [] as number[], [poolId])

  const [draft, setDraft] = useState<number[] | null>(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const selected = draft ?? bound
  const error = loadError || saveError

  function toggle(id: number) {
    setDraft((current) => {
      const base = current ?? bound
      return base.includes(id) ? base.filter((item) => item !== id) : [...base, id]
    })
  }

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      await adminApi.replaceKeyPoolChannels(poolId, selected)
      onSaved()
      onClose()
    } catch (err) {
      setSaveError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='w-[min(calc(100vw-2rem),900px)] max-w-none sm:max-w-[900px]'>
        <DialogHeader>
          <DialogTitle>{pool.name ?? ''} - 绑定渠道</DialogTitle>
          <DialogDescription>已勾选的渠道会使用这个号池里的 Key，已选 {selected.length} 个。</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <div className='flex flex-col gap-2'>
            <Skeleton className='h-9 w-full' />
            <Skeleton className='h-9 w-full' />
            <Skeleton className='h-9 w-full' />
          </div>
        ) : (
          <ul className='max-h-[55vh] divide-y divide-glass-border overflow-y-auto rounded-md border border-glass-border'>
            {channels.length === 0 ? (
              <li className='px-3 py-2 text-sm text-muted-foreground'>暂无可绑定的渠道。</li>
            ) : (
              channels.map((channel) => {
                const id = channel.id ?? 0
                return (
                  <li key={channel.id}>
                    <label className='flex cursor-pointer items-center gap-3 px-3 py-2 text-sm'>
                      <input type='checkbox' className='size-4 accent-primary' checked={selected.includes(id)} onChange={() => toggle(id)} />
                      <span className='min-w-0 flex-1 truncate'>{boundChannelLabel(channel)}</span>
                    </label>
                  </li>
                )
              })
            )}
          </ul>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            关闭
          </Button>
          <Button onClick={() => void save()} disabled={loading || saving}>
            {saving ? '保存中...' : '保存绑定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
