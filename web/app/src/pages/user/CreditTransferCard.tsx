import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageSection } from '@/components/shared/PageSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { userApi } from '@/lib/api/user'
import { getApiErrorMessage } from '@/lib/api/http'
import { useAsync } from '@/hooks/use-async'

export function CreditTransferCard({ userId, onSuccess }: { userId?: number; onSuccess: () => void }) {
  const { data, reload, error: balanceError } = useAsync(() => userApi.getTransferBalance(), null as { credits: number } | null)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const request = useRef<{ signature: string; id: string } | null>(null)
  const credits = (() => {
    if (!/^\d+(\.\d{1,6})?$/.test(amount)) return 0
    const [whole, fraction = ''] = amount.split('.')
    const value = Number(whole) * 1e6 + Number(fraction.padEnd(6, '0'))
    return Number.isSafeInteger(value) ? value : 0
  })()
  function review() {
    const id = Number(recipient)
    if (!/^\d+$/.test(recipient) || !Number.isSafeInteger(id) || id <= 0 || id === userId) { setError('请输入有效的其他用户 ID'); return }
    if (!credits || !data || credits > data.credits) { setError('请输入可转赠范围内的积分，最多 6 位小数'); return }
    setError(''); setConfirm(true)
  }
  async function submit() {
    if (submitting.current) return
    submitting.current = true; setBusy(true)
    const signature = `${recipient}:${credits}`
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() }
    try {
      await userApi.transferCredits({ recipient_id: Number(recipient), credits, request_id: request.current.id })
      request.current = null; setRecipient(''); setAmount(''); setConfirm(false); setError('')
      reload(); onSuccess(); toast.success('积分转赠成功，可在积分流水中查看记录')
    } catch (err) {
      const message = getApiErrorMessage(err); setError(message); setConfirm(false); toast.error(message)
    } finally { submitting.current = false; setBusy(false) }
  }
  return <PageSection title="积分转赠" description="通过用户 ID 将自己的通用积分转赠给其他用户。">
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">可转赠积分：{data ? (data.credits / 1e6).toFixed(6) : '加载中'}。用户端按 1 元 = 1 积分显示；冻结、模型专属及 API 请求预留积分不参与转赠。</p>
      {error || balanceError ? <Alert variant="destructive"><AlertDescription>{error || balanceError}</AlertDescription></Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2"><Label htmlFor="gift-recipient">接收用户 ID</Label><Input id="gift-recipient" inputMode="numeric" placeholder="请输入对方 UID" value={recipient} onChange={e => setRecipient(e.target.value)} disabled={busy} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="gift-amount">转赠积分</Label><Input id="gift-amount" inputMode="decimal" placeholder="例如 10" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} /></div>
      </div>
      <Button className="self-start" onClick={review} disabled={busy || !data}>转赠积分</Button>
    </div>
    <AlertDialog open={confirm} onOpenChange={open => { if (!busy) setConfirm(open) }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认积分转赠</AlertDialogTitle><AlertDialogDescription>将向 UID #{recipient} 转赠 {(credits / 1e6).toFixed(6)} 积分。请核对用户 ID，转赠成功后无法撤回。</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>返回修改</AlertDialogCancel><Button onClick={submit} disabled={busy}>{busy ? '转赠中…' : '确认转赠'}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </PageSection>
}
