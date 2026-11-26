import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAsync } from '@/hooks/use-async'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage, isOutcomeUnknown } from '@/lib/api/http'
import { exactCredits, parseCreditsInput } from '@/lib/formatters/credits'
import { cn } from '@/lib/utils'

/** The account an id points at: nothing usable typed yet, found, or no such account. */
type Target = { state: 'none' } | { state: 'found'; id: number; name: string; balance: number | null } | { state: 'missing'; id: number }

const NONE: Target = { state: 'none' }
const MIN_REASON = 10
const LOOKUP_DELAY = 300

const yuan = (micro: number) => `¥${exactCredits(micro, 2)}`

/** A user id as typed: digits only, and above zero. */
function parseUserId(text: string) {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const id = Number(trimmed)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

async function findUser(idText: string): Promise<Target> {
  const id = parseUserId(idText)
  if (id === null) return NONE
  const res = await adminApi.listUsers(1, 1, { uid: String(id) })
  const users = Array.isArray(res) ? res : (res.items ?? res.users ?? [])
  const user = users.find((item) => item.id === id)
  if (!user) return { state: 'missing', id }
  const balance = user.balance ?? user.balance_credits
  return { state: 'found', id, name: user.username || user.email || '', balance: typeof balance === 'number' ? balance : null }
}

/** The value, once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

/**
 * Add to or take from one user's balance by hand. The operator types yuan; the ledger is written in micro-credits,
 * signed: plus for 补单, minus for 冲销. Before anything is sent the dialog says in one sentence whose balance
 * changes, which way and by how much, with the account's name looked up from the id. Errors stay in the dialog,
 * and it cannot be dismissed while the request is in flight.
 */
export function AdjustDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
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
          <DialogTitle>手动调账</DialogTitle>
          <DialogDescription>每一笔调账都会写入流水，并记下操作人和原因。</DialogDescription>
        </DialogHeader>
        {/* The form lives inside the content, which is unmounted while the dialog is closed, so every opening starts empty. */}
        <AdjustForm busy={busy} onBusy={setBusy} onClose={() => onOpenChange(false)} onDone={onDone} />
      </DialogContent>
    </Dialog>
  )
}

function AdjustForm({ busy, onBusy, onClose, onDone }: { busy: boolean; onBusy: (busy: boolean) => void; onClose: () => void; onDone: () => void }) {
  const [userId, setUserId] = useState('')
  const [kind, setKind] = useState<'recharge' | 'adjust'>('recharge')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const settledId = useSettled(userId, LOOKUP_DELAY)
  const lookup = useAsync(() => findUser(settledId), NONE, [settledId])

  const id = parseUserId(userId)
  // While the id is still being typed, or its lookup is in flight, what is on hand belongs to an earlier id.
  const looking = id !== null && (settledId !== userId || lookup.loading)
  const target: Target = looking || lookup.error ? NONE : lookup.data
  const found = target.state === 'found' && target.id === id ? target : null
  const missing = target.state === 'missing' && target.id === id
  const lookupFailed = id !== null && !looking && Boolean(lookup.error)

  const micro = parseCreditsInput(amount)
  const takes = kind === 'adjust'
  const who = found?.name ? `${found.name}（ID ${id}）` : `用户 ID ${id}`
  const overdrawn = takes && found?.balance != null && micro !== null && micro > found.balance
  const after = found?.balance != null && micro !== null ? found.balance + (takes ? -micro : micro) : null

  function problem() {
    if (id === null) return '请填写用户 ID：一个正整数。'
    if (missing) return `没有 ID 为 ${id} 的用户。`
    if (micro === null || micro === 0) return '请填写金额：大于 0 的数字，最多 6 位小数。'
    if (overdrawn && found?.balance != null) return `${who} 的余额只有 ${yuan(found.balance)}，不够扣减 ${yuan(micro)}。`
    if (reason.trim().length < MIN_REASON) return `调账原因至少 ${MIN_REASON} 个字。`
    return ''
  }

  async function submit() {
    const issue = problem()
    if (issue || id === null || micro === null) {
      setError(issue)
      return
    }
    setError('')
    onBusy(true)
    try {
      const res = await adminApi.adjustTransaction({ user_id: id, type: kind, credits: takes ? -micro : micro, reason: reason.trim() })
      const balance = typeof res.balance_after === 'number' ? `，当前余额 ${yuan(res.balance_after)}` : ''
      toast.success(`调账完成：${who} ${takes ? '扣减' : '增加'} ${yuan(micro)}${balance}`)
      onDone()
      onClose()
    } catch (err) {
      // No answer is not a refusal: the adjustment may have been written, and sending it again would write it twice.
      setError(isOutcomeUnknown(err) ? `${getApiErrorMessage(err)}。这笔调账可能已经入账，请先在流水中核对，再决定是否重试。` : getApiErrorMessage(err))
    } finally {
      onBusy(false)
    }
  }

  // The sentence only shows once it can be stated in full: a known id, and an amount the ledger can hold.
  const stated = id !== null && !looking && !missing && micro !== null && micro > 0

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='adjust-user_id'>用户 ID</Label>
          <Input id='adjust-user_id' inputMode='numeric' placeholder='精确用户 ID' value={userId} disabled={busy} onChange={(event) => setUserId(event.target.value)} />
          <p aria-live='polite' className={cn('min-h-4 text-xs', missing ? 'text-destructive' : 'text-muted-foreground')}>
            {looking
              ? '正在查找用户…'
              : found
                ? `${found.name || '未设置用户名'}${found.balance != null ? ` · 当前余额 ${yuan(found.balance)}` : ''}`
                : missing
                  ? `没有 ID 为 ${id} 的用户。`
                  : lookupFailed
                    ? '没能读到这个用户的信息，提交时由服务器核对。'
                    : ''}
          </p>
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='adjust-type'>操作类型</Label>
          <Select value={kind} disabled={busy} onValueChange={(next) => setKind(next === 'adjust' ? 'adjust' : 'recharge')}>
            <SelectTrigger id='adjust-type'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='recharge'>补单（增加余额）</SelectItem>
              <SelectItem value='adjust'>冲销（减少余额）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='adjust-credits'>金额（元）</Label>
          <Input id='adjust-credits' inputMode='decimal' placeholder='0.00' value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} />
          <p className='text-xs text-muted-foreground'>填正数，增减由操作类型决定。1 元 = 1 积分。</p>
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='adjust-reason'>调账原因（至少 {MIN_REASON} 个字）</Label>
          <Textarea id='adjust-reason' rows={3} placeholder='请详细填写调账原因，便于日后审计' value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
          <p className='text-xs tabular-nums text-muted-foreground'>
            {reason.trim().length} / {MIN_REASON}
          </p>
        </div>
        {stated ? (
          <p data-slot='adjust-summary' className={cn('rounded-xl border border-glass-border bg-glass-strong/50 px-3 py-2.5 text-[13px] tabular-nums', overdrawn ? 'text-destructive' : 'text-foreground')}>
            {overdrawn && found?.balance != null
              ? `${who} 的余额只有 ${yuan(found.balance)}，不够扣减 ${yuan(micro)}。`
              : `${takes ? '将从' : '将给'} ${who} ${takes ? '扣减' : '增加'} ${yuan(micro)}${after !== null ? `，调账后余额 ${yuan(after)}` : ''}。`}
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
        <Button onClick={() => void submit()} disabled={busy || looking}>
          {busy ? '提交中…' : '确认调账'}
        </Button>
      </DialogFooter>
    </>
  )
}
