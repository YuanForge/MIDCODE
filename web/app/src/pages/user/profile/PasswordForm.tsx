import { useState } from 'react'
import { KeyRoundIcon } from 'lucide-react'
import { toast } from 'sonner'

import { SettingRow } from '@/components/shared/SettingRow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiErrorMessage } from '@/lib/api/http'
import { userApi } from '@/lib/api/user'

const EMPTY = { new_password: '', confirm: '' }

export function PasswordForm() {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function fail(message: string) {
    setError(message)
    toast.error(message)
  }

  async function submit() {
    setError('')
    if (form.new_password.length < 8) {
      fail('新密码不少于 8 位')
      return
    }
    if (form.new_password !== form.confirm) {
      fail('两次密码不一致')
      return
    }
    setSaving(true)
    try {
      await userApi.changePassword({ new_password: form.new_password })
      toast.success('密码修改成功')
      setForm(EMPTY)
    } catch (err) {
      fail(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingRow title='修改密码' description='设置至少 8 位的新密码。'>
      <div className='flex flex-col gap-4'>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='new-password'>新密码</Label>
          <Input
            id='new-password'
            type='password'
            value={form.new_password}
            onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))}
            placeholder='至少 8 位'
            autoComplete='new-password'
          />
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='confirm-password'>确认新密码</Label>
          <Input
            id='confirm-password'
            type='password'
            value={form.confirm}
            onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))}
            onKeyDown={(event) => event.key === 'Enter' && void submit()}
            autoComplete='new-password'
          />
        </div>
        <Button className='w-full sm:w-fit' onClick={() => void submit()} disabled={saving}>
          <KeyRoundIcon data-icon='inline-start' />
          {saving ? '保存中…' : '保存密码'}
        </Button>
      </div>
    </SettingRow>
  )
}
