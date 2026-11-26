import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImageUpload } from '@/components/ui/image-upload'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Shown right after a withdrawal is approved: attach the screenshot of the transfer, or skip it. */
export function ProofDialog({
  open,
  url,
  onUrl,
  note,
  onNote,
  error,
  uploading,
  onClose,
  onSubmit,
}: {
  open: boolean
  url: string
  onUrl: (next: string) => void
  note: string
  onNote: (next: string) => void
  error: string
  uploading: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>上传打款凭证</DialogTitle>
          <DialogDescription>审批已通过，请上传打款凭证截图（图片），备注可选。</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label>凭证图片</Label>
            <ImageUpload value={url} onChange={onUrl} accept='image/*' description='请上传打款截图' />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='withdraw-proof-note'>备注</Label>
            <Textarea id='withdraw-proof-note' value={note} onChange={(event) => onNote(event.target.value)} placeholder='打款备注信息（可留空）' rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            跳过
          </Button>
          <Button onClick={onSubmit} disabled={uploading || !url}>
            {uploading ? '提交中…' : '提交凭证'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
