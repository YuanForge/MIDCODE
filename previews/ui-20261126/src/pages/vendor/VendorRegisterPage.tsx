import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthField, AuthPanel } from '@/components/shared/AuthPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createHttpClient, getApiErrorMessage } from '@/lib/api/http'

const vendorHttp = createHttpClient()

export function VendorRegisterPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      await vendorHttp.post<{ id: number; username: string }>('/vendor/auth/register', {
        username,
        password,
      })
      // Backend only returns {id, username} — login separately to get token
      navigate('/vendor/login')
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <AuthPanel
      title='注册 Vendor 账号'
      footer={
        <>
          <span>已有账号？</span>
          <Link to='/vendor/login' className='font-medium text-brand underline-offset-4 hover:underline'>
            立即登录
          </Link>
        </>
      }
    >
      <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
        <AuthField label='用户名' htmlFor='vendor-register-username'>
          <Input
            id='vendor-register-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder='用户名（3-32 字符）'
            autoComplete='username'
            minLength={3}
            maxLength={32}
            required
          />
        </AuthField>
        <AuthField label='密码' htmlFor='vendor-register-password'>
          <Input
            id='vendor-register-password'
            type='password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder='密码（至少 8 位）'
            autoComplete='new-password'
            minLength={8}
            required
          />
        </AuthField>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button className='w-full' size='lg' type='submit'>
          注册并进入 Vendor 端
        </Button>
      </form>
    </AuthPanel>
  )
}
