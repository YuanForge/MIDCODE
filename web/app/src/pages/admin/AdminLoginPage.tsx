import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AuthField, AuthPanel } from '@/components/shared/AuthPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminAuthApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { setRoleToken, setSiteModePreference } from '@/lib/auth/storage'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await adminAuthApi.login({ username, password })
      setRoleToken('admin', response.token)
      setSiteModePreference('admin')
      navigate('/admin/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPanel
      title='登录管理后台'
      description='进入运营、用户、渠道、账务和系统配置中心。'
      footer={<span>管理后台使用独立权限入口，请确认账号来源可信。</span>}
    >
      <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
        <AuthField label='管理员账号' htmlFor='admin-login-username'>
          <Input
            id='admin-login-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder='请输入管理员账号'
            autoComplete='username'
            aria-invalid={Boolean(error)}
            required
          />
        </AuthField>
        <AuthField label='密码' htmlFor='admin-login-password'>
          <Input
            id='admin-login-password'
            type='password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder='请输入密码'
            autoComplete='current-password'
            aria-invalid={Boolean(error)}
            required
          />
        </AuthField>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button className='w-full' size='lg' type='submit' disabled={submitting}>
          {submitting ? '登录中...' : '进入后台'}
        </Button>
      </form>
    </AuthPanel>
  )
}
