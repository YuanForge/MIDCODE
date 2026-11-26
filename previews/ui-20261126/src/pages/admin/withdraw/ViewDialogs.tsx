import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AdminWithdrawal } from '@/lib/api/admin'
import { formatAmount, payTypeLabel } from '@/pages/admin/withdraw/format'

/** The payee's QR code, with the review actions that are still open for this row. */
export function QrDialog({
  row,
  onClose,
  onViewProof,
  onCsApprove,
  onApprove,
}: {
  row: AdminWithdrawal | null
  onClose: () => void
  onViewProof: (row: AdminWithdrawal) => void
  onCsApprove: (row: AdminWithdrawal) => void
  onApprove: (row: AdminWithdrawal) => void
}) {
  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>收款码 — {row?.username}</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col items-center gap-3'>
          {row?.payment_qr ? (
            <img src={row.payment_qr} alt='收款码' className='h-60 w-60 rounded-md border border-glass-border object-contain' />
          ) : (
            <div className='flex h-60 w-60 items-center justify-center rounded-md border border-glass-border text-sm text-muted-foreground'>无收款码</div>
          )}
          <p className='text-sm'>
            {payTypeLabel(row?.payment_type)} · 提现金额：<strong className='font-mono'>{formatAmount(row?.amount)}</strong>
          </p>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            关闭
          </Button>
          {row?.proof_url ? (
            <Button variant='outline' onClick={() => onViewProof(row)}>
              查看打款证明
            </Button>
          ) : null}
          {row?.status === 'pending' && row.review_stage === 'cs_review' ? (
            <Button variant='outline' onClick={() => onCsApprove(row)}>
              初审通过
            </Button>
          ) : null}
          {row?.status === 'pending' && row.review_stage === 'finance_review' ? <Button onClick={() => onApprove(row)}>复审通过</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The screenshot of the transfer and the note that came with it. */
export function ProofViewDialog({ row, onClose }: { row: AdminWithdrawal | null; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>打款证明 — {row?.username}</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          {row?.proof_url ? (
            <img src={row.proof_url} alt='打款证明' className='max-h-[70vh] w-full rounded-md border border-glass-border object-contain' />
          ) : (
            <div className='flex h-60 items-center justify-center rounded-md border border-glass-border text-sm text-muted-foreground'>无打款证明</div>
          )}
          <div className='grid gap-1 text-sm text-muted-foreground'>
            <p>
              {payTypeLabel(row?.payment_type)} · 提现金额：<strong className='font-mono text-foreground'>{formatAmount(row?.amount)}</strong>
            </p>
            <p>备注：{row?.proof_note?.trim() ? row.proof_note : '-'}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
