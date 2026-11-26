import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { AdminWithdrawal } from '@/lib/api/admin'

const REASONS = [
  '收款信息有误，请重新提交',
  '账户存在异常，暂不处理',
  '未满足提现门槛',
  '信息不完整，请补充材料',
  '超出单笔提现限额',
  '重复提交申请',
]

/** Reject a withdrawal: pick a stock reason or write one. A failed request is reported here, not behind the dialog. */
export function RejectDialog({
  row,
  remark,
  onRemark,
  error,
  onClose,
  onConfirm,
}: {
  row: AdminWithdrawal | null
  remark: string
  onRemark: (next: string) => void
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>拒绝提现申请</DialogTitle>
        </DialogHeader>
        <div className='flex flex-wrap gap-1.5'>
          {REASONS.map((reason) => (
            <Button key={reason} size='sm' variant={remark === reason ? 'default' : 'outline'} className='h-7 text-xs' onClick={() => onRemark(reason)}>
              {reason}
            </Button>
          ))}
        </div>
        <Textarea value={remark} onChange={(event) => onRemark(event.target.value)} placeholder='填写或自定义拒绝原因' />
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            取消
          </Button>
          <Button onClick={onConfirm}>确认拒绝</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
