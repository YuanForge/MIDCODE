import { Trash2Icon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CONFIRM_PHRASE } from '@/pages/admin/tasks/taskFormat'

/** The last step before records are deleted for good: type the phrase to unlock the button. A failed run is reported here. */
export function CleanupConfirmDialog({
  open,
  onOpenChange,
  targetName,
  cutoff,
  count,
  text,
  onText,
  error,
  running,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetName: string
  cutoff: string
  count: number
  text: string
  onText: (next: string) => void
  error: string
  running: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!running) onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认清理数据</AlertDialogTitle>
          <AlertDialogDescription>
            将物理删除{targetName}中早于 {cutoff} 的 {count.toLocaleString()} 条记录。此操作不会删除进行中数据和账单流水，但删除后无法恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='cleanup-confirm' className='text-xs text-muted-foreground'>
            输入“{CONFIRM_PHRASE}”后执行
          </Label>
          <Input id='cleanup-confirm' autoFocus value={text} onChange={(event) => onText(event.target.value)} placeholder={CONFIRM_PHRASE} disabled={running} />
        </div>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>取消</AlertDialogCancel>
          <Button variant='destructive' onClick={onConfirm} disabled={running || text.trim() !== CONFIRM_PHRASE}>
            <Trash2Icon data-icon='inline-start' />
            {running ? '清理中…' : CONFIRM_PHRASE}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
