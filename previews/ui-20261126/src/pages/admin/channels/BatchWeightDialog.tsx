import { useState } from 'react'

import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

/** One weight for every ticked channel. Mounted only while open, so it starts empty each time. */
export function BatchWeightDialog({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => void }) {
  const [weight, setWeight] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const value = Number(weight)
    if (!weight.trim() || !Number.isInteger(value) || value < 1) {
      setError('权重需要是正整数')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await adminApi.batchUpdateChannels({ action: 'set_rate', ids, rate_ratio: value })
      onDone()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !submitting) onClose()
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>批量设置权重</DialogTitle>
          <DialogDescription>将选中 {ids.length} 个渠道的权重设为同一值。</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <TextField id='batch-weight' type='number' min={1} step='1' label='权重' value={weight} onChange={setWeight} placeholder='权重（正整数）' hint='加权随机，越大被选中概率越高。' />
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
