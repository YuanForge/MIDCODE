import { useState } from 'react'

import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

const ROLES = [
  { value: 'user', label: 'user（普通用户）' },
  { value: 'operator', label: 'operator（运营）' },
  { value: 'admin', label: 'admin（管理员）' },
]

type NewUser = { username: string; email: string; password: string; role: string }

/** An admin-created account skips email verification, so name, email and password are all required here. */
export function CreateUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<NewUser>({ username: '', email: '', password: '', role: 'user' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function set(key: keyof NewUser, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit() {
    if (!form.username || !form.email || !form.password) {
      setError('请填写所有必填字段')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await adminApi.createUser(form)
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
          <DialogTitle>创建用户</DialogTitle>
          <DialogDescription>填写新用户信息，将由管理员直接创建账号（无需邮箱验证）。</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className='flex flex-col gap-4'>
          <TextField id='new-username' label='用户名' value={form.username} onChange={(value) => set('username', value)} placeholder='3-32 位字符' />
          <TextField id='new-email' type='email' label='邮箱' value={form.email} onChange={(value) => set('email', value)} placeholder='唯一，用于登录' />
          <TextField id='new-password' type='password' label='密码' value={form.password} onChange={(value) => set('password', value)} placeholder='至少 8 位' />
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='new-role'>角色</Label>
            <Select value={form.role} onValueChange={(value) => set('role', value)}>
              <SelectTrigger id='new-role'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
