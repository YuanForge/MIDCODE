import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { NotificationForm } from '@/pages/admin/notifications/notificationForm'

/** Write a notification as a draft. Who receives it is decided here; sending is a separate step on the list. */
export function CreateNotificationDialog({
  open,
  onOpenChange,
  form,
  onField,
  error,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: NotificationForm
  onField: <K extends keyof NotificationForm>(key: K, value: NotificationForm[K]) => void
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建通知</DialogTitle>
          <DialogDescription>先保存为草稿，确认无误后在列表里发送。</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='notification-title'>标题</Label>
            <Input id='notification-title' value={form.title} onChange={(event) => onField('title', event.target.value)} />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='notification-content'>内容</Label>
            <Textarea id='notification-content' rows={4} value={form.content} onChange={(event) => onField('content', event.target.value)} />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='notification-target'>发送目标</Label>
            <Select value={form.target_type} onValueChange={(value) => onField('target_type', value)}>
              <SelectTrigger id='notification-target'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部用户</SelectItem>
                <SelectItem value='user'>指定用户</SelectItem>
                <SelectItem value='group'>指定用户组</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.target_type !== 'all' ? (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='notification-target-value'>{form.target_type === 'user' ? '用户 ID' : '用户组'}</Label>
              <Input id='notification-target-value' value={form.target_value} onChange={(event) => onField('target_value', event.target.value)} />
            </div>
          ) : null}
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
            {submitting ? '创建中...' : '创建草稿'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
