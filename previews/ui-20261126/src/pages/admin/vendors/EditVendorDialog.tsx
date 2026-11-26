import { SaveIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AdminVendor } from '@/lib/api/admin'
import { vendorLabel } from '@/pages/admin/vendors/vendorFields'

/** Edit one vendor's fee ratio. Leaving it empty means the vendor follows the global default. */
export function EditVendorDialog({
  vendor,
  percent,
  onPercent,
  error,
  saving,
  onClose,
  onSave,
}: {
  vendor: AdminVendor | null
  percent: string
  onPercent: (next: string) => void
  error: string
  saving: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Dialog
      open={Boolean(vendor)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑号商</DialogTitle>
          <DialogDescription>当前号商：{vendorLabel(vendor)}</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='vendor-commission'>手续费比例（%）</Label>
            <Input
              id='vendor-commission'
              value={percent}
              onChange={(event) => onPercent(event.target.value)}
              placeholder='例如：15（代表15%），留空使用全局默认'
            />
          </div>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSave} disabled={saving}>
            <SaveIcon data-icon='inline-start' />
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
