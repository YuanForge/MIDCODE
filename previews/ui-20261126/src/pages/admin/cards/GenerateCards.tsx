import { useState } from 'react'
import { CopyIcon } from 'lucide-react'

import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi, type AdminCard, type AdminVendor } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { copyToClipboard } from '@/lib/clipboard'
import { buildGeneratePayload, cardLine, initialGenerateForm, type GenerateForm } from '@/pages/admin/cards/cardFormat'

const NO_VENDOR = '__none__'

/** The generate button with its two dialogs: the form, then the codes that came back. Errors stay in the form. */
export function GenerateCards({ vendors, onGenerated }: { vendors: AdminVendor[]; onGenerated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<GenerateForm>(initialGenerateForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cards, setCards] = useState<AdminCard[]>([])
  const [resultOpen, setResultOpen] = useState(false)

  function update<K extends keyof GenerateForm>(key: K, value: GenerateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openDialog() {
    setError('')
    setOpen(true)
  }

  async function submit() {
    const built = buildGeneratePayload(form)
    if ('error' in built) {
      setError(built.error)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const response = await adminApi.generateCards(built.payload)
      setCards(response.cards ?? [])
      setOpen(false)
      setResultOpen(true)
      onGenerated()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const text = cards.map(cardLine).join('\n')

  return (
    <>
      <Button onClick={openDialog}>生成卡密</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量生成卡密</DialogTitle>
            <DialogDescription>面值以元为单位填写，生成后会得到一批兑换码。</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <TextField id='card-count' label='数量' placeholder='数量' value={form.count} onChange={(next) => update('count', next)} />
              <TextField id='card-amount' label='面值（元）' placeholder='面值（元）' value={form.amount} onChange={(next) => update('amount', next)} />
              <TextField id='card-note' label='备注' placeholder='备注' wide value={form.note} onChange={(next) => update('note', next)} />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='card-vendor'>来源分销（可选）</Label>
              <Select value={form.vendorId || NO_VENDOR} onValueChange={(next) => update('vendorId', next === NO_VENDOR ? '' : next)}>
                <SelectTrigger id='card-vendor'>
                  <SelectValue placeholder='不绑定分销' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VENDOR}>不绑定分销</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={String(vendor.id)}>
                      #{vendor.id} {vendor.username ?? vendor.name ?? ''}
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
            <Button variant='outline' onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? '生成中...' : '生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成结果</DialogTitle>
            <DialogDescription>共 {cards.length} 张。关闭后仍可在卡密列表中查看。</DialogDescription>
          </DialogHeader>
          <pre className='max-h-96 overflow-auto rounded-md border border-glass-border bg-glass-strong/50 p-4 font-mono text-xs'>{text}</pre>
          <DialogFooter>
            <Button variant='outline' onClick={() => setResultOpen(false)}>
              关闭
            </Button>
            <Button onClick={() => void copyToClipboard(text, { successMessage: '卡密列表已复制' })}>
              <CopyIcon data-icon='inline-start' />
              复制全部
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
