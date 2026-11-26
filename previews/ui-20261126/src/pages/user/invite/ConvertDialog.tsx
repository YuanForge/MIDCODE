import { useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiErrorMessage, isOutcomeUnknown } from '@/lib/api/http'
import { userApi } from '@/lib/api/user'
import { exactCredits, parseCreditsInput } from '@/lib/formatters/credits'
import { cn } from '@/lib/utils'

const credits = (micro: number) => `${exactCredits(micro, 2)} 积分`

/**
 * Turn frozen rebate into spendable balance. The person types credits; the server takes micro-credits, so the
 * amount is read digit by digit and sent exactly. Converting cannot be undone (converted credits cannot be
 * withdrawn any more), so the dialog says what will happen before it is sent, never sends 0 or an unreadable
 * amount (the server reads 0 as everything), asks for "all" only by sending the exact frozen figure, keeps errors
 * inside the dialog, and cannot be dismissed while the request is in flight.
 */
export function ConvertDialog({
  open,
  onOpenChange,
  frozen,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Frozen rebate, in micro-credits. */
  frozen: number
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>解冻返佣</DialogTitle>
          <DialogDescription>把冻结的返佣转入可用余额。转入后只能用于调用，不能再申请提现。</DialogDescription>
        </DialogHeader>
        {/* The form lives inside the content, which is unmounted while the dialog is closed, so every opening starts empty. */}
        <ConvertForm frozen={frozen} busy={busy} onBusy={setBusy} onClose={() => onOpenChange(false)} onDone={onDone} />
      </DialogContent>
    </Dialog>
  )
}

function ConvertForm({ frozen, busy, onBusy, onClose, onDone }: { frozen: number; busy: boolean; onBusy: (busy: boolean) => void; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const micro = parseCreditsInput(amount)
  const tooMuch = micro !== null && micro > frozen
  const ready = micro !== null && micro > 0 && !tooMuch

  function problem() {
    if (frozen <= 0) return '当前没有冻结返佣可以解冻。'
    if (micro === null || micro === 0) return '请填写解冻数量：大于 0 的数字，最多 6 位小数。'
    if (tooMuch) return `冻结返佣只有 ${credits(frozen)}，不够解冻 ${exactCredits(micro)} 积分。`
    return ''
  }

  async function submit() {
    const issue = problem()
    if (issue || micro === null) {
      setError(issue)
      return
    }
    setError('')
    onBusy(true)
    try {
      await userApi.convertFrozen(micro)
      toast.success(`已解冻 ${credits(micro)}，已转入可用余额。`)
      onDone()
      onClose()
    } catch (err) {
      // No answer is not a refusal: the conversion may have been applied, and the frozen figure shown here is stale.
      setError(isOutcomeUnknown(err) ? `${getApiErrorMessage(err)}。这次解冻可能已经生效，请刷新页面核对冻结返佣后再决定是否重试。` : getApiErrorMessage(err))
    } finally {
      onBusy(false)
    }
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <p className='text-[13px] text-muted-foreground tabular-nums'>
          当前冻结返佣 <span className='font-medium text-foreground'>{credits(frozen)}</span>
        </p>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='convert-amount'>解冻数量（积分）</Label>
          <div className='flex items-center gap-2'>
            <Input id='convert-amount' inputMode='decimal' placeholder='0.00' value={amount} disabled={busy || frozen <= 0} onChange={(event) => setAmount(event.target.value)} />
            <Button type='button' variant='outline' disabled={busy || frozen <= 0} onClick={() => setAmount(exactCredits(frozen))}>
              全部解冻
            </Button>
          </div>
          <p className='text-xs text-muted-foreground'>1 积分 = 1 元，最多 6 位小数。</p>
        </div>
        {ready && micro !== null ? (
          <p data-slot='convert-summary' className={cn('rounded-xl border border-glass-border bg-glass-strong/50 px-3 py-2.5 text-[13px] tabular-nums text-foreground')}>
            将把 {credits(micro)} 转入可用余额，冻结返佣剩 {credits(frozen - micro)}。
          </p>
        ) : null}
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant='outline' disabled={busy} onClick={onClose}>
          取消
        </Button>
        <Button onClick={() => void submit()} disabled={busy || frozen <= 0}>
          {busy ? '解冻中…' : '确认解冻'}
        </Button>
      </DialogFooter>
    </>
  )
}
