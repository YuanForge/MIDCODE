import { CopyIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { copyToClipboard } from '@/lib/clipboard'
import type { ResellerModelGroup } from '@/lib/api/reseller'

type Group = ResellerModelGroup & { id: number }

/** Create a reseller key. Groups are numbered in the order they are ticked, because that order is the routing order. */
export function CreateKeyDialog({
  open,
  onOpenChange,
  name,
  onName,
  groups,
  groupIds,
  onToggle,
  createdKey,
  error,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  onName: (next: string) => void
  groups: ResellerModelGroup[]
  groupIds: number[]
  onToggle: (id: number) => void
  createdKey: string
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  const choices = groups.filter((group): group is Group => typeof group.id === 'number')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>生成代理商 Key</DialogTitle>
          <DialogDescription>Key 会用于代理站和主站 API 的对接，请创建后立即保存。</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='reseller-key-name'>Key 名称</Label>
            <Input id='reseller-key-name' value={name} onChange={(event) => onName(event.target.value)} />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label id='reseller-key-groups'>模型分组顺序</Label>
            <ul aria-labelledby='reseller-key-groups' className='max-h-56 divide-y divide-glass-border overflow-y-auto rounded-md border border-glass-border'>
              {choices.length === 0 ? (
                <li className='px-3 py-2 text-sm text-muted-foreground'>暂无可选的模型分组。</li>
              ) : (
                choices.map((group) => {
                  const position = groupIds.indexOf(group.id)
                  return (
                    <li key={group.id}>
                      <label className='flex cursor-pointer items-center gap-3 px-3 py-2 text-sm'>
                        <input type='checkbox' className='size-4 accent-primary' checked={position >= 0} onChange={() => onToggle(group.id)} />
                        <span className='min-w-0 flex-1 truncate'>{group.name || group.code}</span>
                        {position >= 0 ? <span className='font-mono text-xs tabular-nums text-muted-foreground'>{position + 1}</span> : null}
                      </label>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {createdKey ? (
            <Alert>
              <AlertDescription className='flex flex-col gap-3'>
                <span>Key 已生成，请立即保存。</span>
                <code className='break-all rounded-md border border-glass-border bg-glass-strong/50 p-2 font-mono text-xs'>{createdKey}</code>
                <Button size='sm' variant='outline' className='self-start' onClick={() => copyToClipboard(createdKey, { successMessage: '已复制 Key' })}>
                  <CopyIcon data-icon='inline-start' />
                  复制 Key
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button onClick={onSubmit} disabled={submitting || Boolean(createdKey)}>
            {submitting ? '生成中...' : '生成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
