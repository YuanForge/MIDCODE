import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'

export function WithdrawDialog({
  open,
  onOpenChange,
  amount,
  onAmountChange,
  paymentType,
  onPaymentTypeChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: string
  onAmountChange: (next: string) => void
  paymentType: string
  onPaymentTypeChange: (next: string) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>申请提现</DialogTitle>
          <DialogDescription>
            提交后将申请提现 {Number(amount) > 0 ? `${Number(amount).toFixed(2)} 积分` : '所填积分'}，并进入人工审核。
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <Input
            type='number'
            min='0'
            step='0.01'
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder='提现积分数量（如 0.1）'
            aria-label='提现积分数量'
          />
          <NativeSelect value={paymentType} onChange={(event) => onPaymentTypeChange(event.target.value)} aria-label='收款方式'>
            <option value='wechat'>微信</option>
            <option value='alipay'>支付宝</option>
          </NativeSelect>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit}>提交提现</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
