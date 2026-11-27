import { LoaderCircleIcon } from 'lucide-react'

import { ModelGroupSelector } from '@/components/shared/ModelGroupSelector'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiKeyModelGroup } from '@/lib/api/user'

/** New key: a name and an ordered list of model groups. Errors show inside the dialog, where the person is looking. */
export function CreateKeyDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  groups,
  selectedIds,
  onSelectedChange,
  error,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  onNameChange: (next: string) => void
  groups: ApiKeyModelGroup[]
  selectedIds: number[]
  onSelectedChange: (ids: number[]) => void
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>创建 API 密钥</DialogTitle>
          <DialogDescription>创建后会返回一次性明文，关闭后只能看到遮罩形式。</DialogDescription>
        </DialogHeader>
        <div className='-mx-1 flex min-w-0 flex-col gap-5 overflow-y-auto px-1 pb-1'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='new-api-key-name'>名称</Label>
            <Input
              id='new-api-key-name'
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder='例如：我的项目'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label>模型分组顺序</Label>
            <p className='-mt-1 text-[13px] text-muted-foreground'>第一组优先调用，后续分组只在可重试失败时作为回退。</p>
            <ModelGroupSelector groups={groups} selectedIds={selectedIds} onChange={onSelectedChange} />
          </div>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? <LoaderCircleIcon className='animate-spin' data-icon='inline-start' /> : null}
            {submitting ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
