import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import type { AdminChannel } from '@/lib/api/admin'
import { channelLabel } from '@/pages/admin/keypools/poolFormat'

/** Create a pool: which channel it starts with, and what it is called. More channels can be bound afterwards. */
export function CreatePoolDialog({
  open,
  onOpenChange,
  channels,
  channelId,
  onChannelId,
  name,
  onName,
  error,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: AdminChannel[]
  channelId: string
  onChannelId: (next: string) => void
  name: string
  onName: (next: string) => void
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>新建号池</DialogTitle>
          <DialogDescription>号池把同一类上游 Key 放在一起，创建后可继续绑定更多渠道。</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='pool-channel'>关联渠道</Label>
            <NativeSelect id='pool-channel' value={channelId} onChange={(event) => onChannelId(event.target.value)}>
              <option value=''>选择关联渠道</option>
              {channels.map((channel) => (
                <option key={channel.id} value={String(channel.id)}>
                  {channelLabel(channel)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <TextField id='pool-name' label='号池名称' placeholder='号池名称' value={name} onChange={onName} />
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
          <Button onClick={onSubmit} disabled={submitting || !name.trim()}>
            {submitting ? '创建中...' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
