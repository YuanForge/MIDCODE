import { useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { adminApi, type AdminUser } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { deductionPayload, formatPoints, pointsPreview } from '@/lib/admin-points'

export function DeductPointsDialog({ user, onClose, onSuccess }: {
  user?: AdminUser
  onClose: () => void
  onSuccess: (message: string) => void
}) {
  const [userID, setUserID] = useState(String(user?.id ?? ''))
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const preview = pointsPreview(amount)

  async function submit() {
    if (submitting.current) return
    setError('')
    let payload
    try { payload = deductionPayload(userID, amount, reason) }
    catch (err) { setError(getApiErrorMessage(err)); return }
    submitting.current = true
    setPending(true)
    try {
      await adminApi.adjustTransaction(payload)
      onSuccess(`已为用户 #${payload.user_id} 扣除 ${formatPoints(-payload.credits)} 积分`)
    } catch (err) { setError(getApiErrorMessage(err)) }
    finally { submitting.current = false; setPending(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !submitting.current) onClose() }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>扣除积分</DialogTitle>
        <DialogDescription>核对用户和积分数量后确认，扣除原因会记录在账单中。</DialogDescription>
      </DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
        {user ? <p className="text-sm">用户 #{user.id} · {user.username || user.email}
          {user.balance != null && <span className="block text-muted-foreground">当前余额：{formatPoints(Number(user.balance))} 积分</span>}
        </p> : <div className="flex flex-col gap-2">
          <Label htmlFor="deduct-user-id">用户 ID</Label>
          <Input id="deduct-user-id" inputMode="numeric" value={userID} onChange={e => { setUserID(e.target.value); setError('') }} />
        </div>}
        <div className="flex flex-col gap-2">
          <Label htmlFor="deduct-points">扣除积分数</Label>
          <Input id="deduct-points" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setError('') }} placeholder="输入正数，最多 6 位小数" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="deduct-reason">扣除原因</Label>
          <Textarea id="deduct-reason" value={reason} onChange={e => { setReason(e.target.value); setError('') }} placeholder="至少 10 个字符" rows={3} />
        </div>
        {preview && <Alert><AlertDescription>将从用户 #{userID || '待填写'} 扣除 {preview} 积分。</AlertDescription></Alert>}
      </fieldset>
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>取消</Button>
        <Button variant="destructive" disabled={pending} onClick={() => void submit()}>{pending ? '提交中…' : '确认扣除'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
