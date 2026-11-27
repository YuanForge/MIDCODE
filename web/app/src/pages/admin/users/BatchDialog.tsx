import { useState } from 'react'

import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getApiErrorMessage } from '@/lib/api/http'
import { VipSelect } from '@/pages/admin/users/ActionFields'
import { runBatch } from '@/pages/admin/users/actions'
import type { VipChoice } from '@/pages/admin/users/userFormat'

/** Freeze or re-tier every ticked account in one request. Mounted only while open. */
export function BatchDialog({
  kind,
  ids,
  vipChoices,
  onClose,
  onDone,
}: {
  kind: 'freeze' | 'group'
  ids: number[]
  vipChoices: VipChoice[]
  onClose: () => void
  onDone: () => void
}) {
  // The reason when freezing, the tier code when re-tiering.
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const freezing = kind === 'freeze'

  async function submit() {
    if (!freezing && !value) {
      setError('请选择 VIP 分组')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await runBatch(freezing ? 'freeze' : 'set_group', ids, freezing ? { reason: value } : { group: value })
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
          <DialogTitle>{freezing ? '批量冻结账户' : '批量设置 VIP 等级'}</DialogTitle>
          <DialogDescription>{freezing ? `将对已选 ${ids.length} 个用户执行冻结操作。` : `将对已选 ${ids.length} 个用户统一设置 VIP 等级。`}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {freezing ? (
          <TextField id='batch-reason' label='冻结原因（可选）' value={value} onChange={setValue} placeholder='违规原因' />
        ) : (
          <VipSelect id='batch-group' value={value} onChange={setValue} choices={vipChoices} hint='批量调整后，每个用户都会从各自当前累计充值额重新统计后续升档。' />
        )}
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button variant={freezing ? 'destructive' : 'default'} onClick={() => void submit()} disabled={submitting}>
            {freezing ? '确认冻结' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
