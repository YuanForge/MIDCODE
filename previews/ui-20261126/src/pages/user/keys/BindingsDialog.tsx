import { LoaderCircleIcon } from 'lucide-react'

import { ModelGroupSelector } from '@/components/shared/ModelGroupSelector'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ApiKeyModelGroup } from '@/lib/api/user'

/**
 * Change which model groups a key uses and in what order: tick a group to add it, untick it to remove it, drag or use
 * the arrows to reorder. The first group is called first; the rest are retry fallbacks. A key keeps at least one
 * group, and saving waits until something changed. Errors stay in the dialog, where the person is looking, and the
 * dialog cannot be dismissed while the request is in flight.
 */
export function BindingsDialog({
  open,
  keyName,
  onClose,
  groups,
  ids,
  onIdsChange,
  unchanged,
  error,
  saving,
  onSave,
}: {
  open: boolean
  keyName?: string
  onClose: () => void
  groups: ApiKeyModelGroup[]
  ids: number[]
  onIdsChange: (ids: number[]) => void
  unchanged: boolean
  error: string
  saving: boolean
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent className='max-h-[calc(100dvh-2rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>修改模型分组</DialogTitle>
          <DialogDescription>
            {keyName ? `「${Array.from(keyName).slice(0, 20).join('')}${Array.from(keyName).length > 20 ? '…' : ''}」：` : ''}勾选要使用的分组，拖动或用箭头调整顺序。第一组优先调用，后续分组只在可重试失败时作为回退。
          </DialogDescription>
        </DialogHeader>
        <div className='-mx-1 flex min-w-0 flex-col gap-3 overflow-y-auto px-1 pb-1'>
          <ModelGroupSelector groups={groups} selectedIds={ids} onChange={onIdsChange} />
          {ids.length === 0 ? <p className='text-[13px] text-destructive'>至少保留一个模型分组。</p> : null}
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSave} disabled={saving || ids.length === 0 || unchanged}>
            {saving ? <LoaderCircleIcon className='animate-spin' data-icon='inline-start' /> : null}
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
