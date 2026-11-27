import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { AuthField, AuthPanel } from '@/components/shared/AuthPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage } from '@/lib/api/http'
import { authApi } from '@/lib/api/public'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      await authApi.forgotPassword(email)
      setMessage('如果邮箱已绑定账号，重置指引将发送到该邮箱。')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPanel
      title='找回密码'
      description='输入账号绑定邮箱以获取密码重置指引。'
      footer={
        <Link className='font-medium text-brand underline-offset-4 hover:underline' to='/login'>
          返回登录
        </Link>
      }
    >
      <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
        <AuthField label='邮箱' htmlFor='forgot-password-email'>
          <Input
            id='forgot-password-email'
            type='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder='请输入账号绑定邮箱'
            autoComplete='email'
          />
        </AuthField>
        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button className='w-full' size='lg' type='submit' disabled={submitting}>
          {submitting ? '提交中...' : '发送重置指引'}
        </Button>
      </form>
    </AuthPanel>
  )
}
