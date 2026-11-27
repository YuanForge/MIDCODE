import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AuthField, AuthPanel } from '@/components/shared/AuthPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resellerAuthApi } from '@/lib/api/reseller'
import { getApiErrorMessage } from '@/lib/api/http'
import { setRoleToken, setSiteModePreference } from '@/lib/auth/storage'

export function ResellerLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await resellerAuthApi.login({ username, password })
      setRoleToken('reseller', response.token)
      setSiteModePreference('reseller')
      navigate('/reseller/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPanel title='登录代理商后台'>
      <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
        <AuthField label='用户名或邮箱' htmlFor='reseller-login-username'>
          <Input
            id='reseller-login-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder='用户名或邮箱'
            autoComplete='username'
          />
        </AuthField>
        <AuthField label='密码' htmlFor='reseller-login-password'>
          <Input
            id='reseller-login-password'
            type='password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder='密码'
            autoComplete='current-password'
          />
        </AuthField>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button className='w-full' size='lg' type='submit' disabled={submitting}>
          {submitting ? '登录中...' : '进入代理商后台'}
        </Button>
      </form>
    </AuthPanel>
  )
}
