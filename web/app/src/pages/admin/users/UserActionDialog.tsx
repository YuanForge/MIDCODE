import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AdminUser } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { ActionFields } from '@/pages/admin/users/ActionFields'
import { ACTION_TITLES, initialActionForm, runAction, validateAction, type ActionForm, type EditMode } from '@/pages/admin/users/actions'
import type { VipChoice } from '@/pages/admin/users/userFormat'

/** One action on one account. Mounted only while open, so the form starts from the account's current values every time. */
export function UserActionDialog({
  mode,
  user,
  vipChoices,
  onClose,
  onDone,
}: {
  mode: EditMode
  user: AdminUser
  vipChoices: VipChoice[]
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState<ActionForm>(() => initialActionForm(mode, user))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const problem = validateAction(mode, form)
    if (problem) {
      setError(problem)
      return
    }
    if (user.id == null) {
      setError('无法识别该用户，请刷新后重试')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await runAction(mode, user.id, form)
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
          <DialogTitle>{ACTION_TITLES[mode]}</DialogTitle>
          <DialogDescription>用户：{user.username ?? user.email ?? '-'}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <ActionFields mode={mode} form={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} vipChoices={vipChoices} />
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button variant={mode === 'freeze' ? 'destructive' : 'default'} onClick={() => void submit()} disabled={submitting}>
            {mode === 'freeze' ? '确认冻结' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
