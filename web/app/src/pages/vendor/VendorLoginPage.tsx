import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthField, AuthPanel } from '@/components/shared/AuthPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createHttpClient, getApiErrorMessage } from '@/lib/api/http'
import { setRoleToken, setSiteModePreference } from '@/lib/auth/storage'

const vendorHttp = createHttpClient()

export function VendorLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const response = await vendorHttp.post<{ token: string }>('/vendor/auth/login', {
        username,
        password,
      })
      setRoleToken('vendor', response.token)
      setSiteModePreference('vendor')
      navigate('/vendor/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <AuthPanel
      title='登录 Vendor 端'
      footer={
        <>
          <span>还没有账号？</span>
          <Link to='/vendor/register' className='font-medium text-brand underline-offset-4 hover:underline'>
            立即注册
          </Link>
        </>
      }
    >
      <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
        <AuthField label='用户名' htmlFor='vendor-login-username'>
          <Input
            id='vendor-login-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder='用户名'
            autoComplete='username'
          />
        </AuthField>
        <AuthField label='密码' htmlFor='vendor-login-password'>
          <Input
            id='vendor-login-password'
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
        <Button className='w-full' size='lg' type='submit'>
          进入 Vendor 端
        </Button>
      </form>
    </AuthPanel>
  )
}
