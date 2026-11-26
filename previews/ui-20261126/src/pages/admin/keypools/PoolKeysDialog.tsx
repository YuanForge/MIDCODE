import { useState } from 'react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminKeyPool, type AdminPoolKey } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { AddKeyBar, type NewKey } from '@/pages/admin/keypools/AddKeyBar'
import { ImportPanel } from '@/pages/admin/keypools/ImportPanel'
import { PoolKeysTable } from '@/pages/admin/keypools/PoolKeysTable'

/**
 * Everything about the keys of one pool. The page mounts this only while a pool is open, so the drafts start empty each time.
 * Edits sit in `drafts` until a row is saved, and every failure is reported here, not behind the dialog.
 */
export function PoolKeysDialog({ pool, onClose }: { pool: AdminKeyPool; onClose: () => void }) {
  const poolId = pool.id as number
  const { data: keys, loading, error: loadError, reload } = useAsync(async () => {
    const response = await adminApi.listPoolKeys(poolId)
    return Array.isArray(response) ? response : response.keys ?? []
  }, [] as AdminPoolKey[], [poolId])

  const [drafts, setDrafts] = useState<Record<number, Partial<AdminPoolKey>>>({})
  const [mutError, setMutError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<AdminPoolKey | null>(null)

  const rows = keys.map((row) => (row.id != null && drafts[row.id] ? { ...row, ...drafts[row.id] } : row))
  const error = loadError || mutError

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setMutError('')
    try {
      return await action()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
      return null
    }
  }

  function patchDraft(id: number | undefined, patch: Partial<AdminPoolKey>) {
    if (!id) return
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  async function addKey(input: NewKey) {
    const done = await run(async () => {
      await adminApi.addPoolKey(poolId, input)
      reload()
      return true
    })
    return done === true
  }

  async function saveRow(row: AdminPoolKey) {
    const id = row.id
    if (!id) return
    const done = await run(async () => {
      await adminApi.updatePoolKey(id, {
        priority: row.priority ?? 0,
        is_active: row.is_active ?? true,
        base_url_override: row.base_url_override?.trim() ?? '',
      })
      return true
    })
    if (!done) return
    setDrafts((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    reload()
  }

  async function executeRemove() {
    const id = pendingRemove?.id
    setPendingRemove(null)
    if (!id) return
    await run(async () => {
      await adminApi.removePoolKey(id)
      reload()
    })
  }

  async function unbindVendor(row: AdminPoolKey) {
    const id = row.id
    if (!id) return
    await run(async () => {
      await adminApi.setPoolKeyVendor(id, null)
      reload()
    })
  }

  function importKeys(lines: string[]) {
    return run(async () => {
      const res = await adminApi.importPoolKeys(poolId, lines)
      reload()
      return res
    })
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent className='max-h-[86vh] w-[min(calc(100vw-2rem),1280px)] max-w-none overflow-y-auto sm:max-w-[1280px]'>
          <DialogHeader>
            <DialogTitle>{pool.name ?? ''} - Key 管理</DialogTitle>
            <DialogDescription>表格里的改动要点该行的「保存」才会生效。</DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <AddKeyBar importOpen={importOpen} onToggleImport={() => setImportOpen((current) => !current)} onAdd={addKey} />
          {importOpen ? <ImportPanel onImport={importKeys} onClose={() => setImportOpen(false)} /> : null}
          <PoolKeysTable
            rows={rows}
            loading={loading}
            isDirty={(id) => id != null && id in drafts}
            onDraft={patchDraft}
            onSave={(row) => void saveRow(row)}
            onRemove={setPendingRemove}
            onUnbind={(row) => void unbindVendor(row)}
          />
        </DialogContent>
      </Dialog>
      <ConfirmAction
        open={pendingRemove != null}
        onClose={() => setPendingRemove(null)}
        title='确认删除 Key'
        description={`确认删除 Key #${pendingRemove?.id ?? ''} 吗？此操作不可撤销。`}
        confirmLabel='确认删除'
        onConfirm={() => void executeRemove()}
      />
    </>
  )
}
