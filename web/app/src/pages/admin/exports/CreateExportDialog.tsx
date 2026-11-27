import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EXPORT_TYPES, type ExportForm } from '@/pages/admin/exports/exportForm'

/** Queue an export. A rejected request is reported here, where the person is looking. */
export function CreateExportDialog({
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
  form: ExportForm
  onField: <K extends keyof ExportForm>(key: K, value: ExportForm[K]) => void
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建导出任务</DialogTitle>
          <DialogDescription>任务在后台生成，完成后可在列表里下载。</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='export-name'>任务名称</Label>
            <Input id='export-name' value={form.name} onChange={(event) => onField('name', event.target.value)} placeholder='如：5月账单导出' />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='export-type'>导出类型</Label>
            <Select value={form.type} onValueChange={(value) => onField('type', value)}>
              <SelectTrigger id='export-type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {submitting ? '提交中...' : '提交'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
