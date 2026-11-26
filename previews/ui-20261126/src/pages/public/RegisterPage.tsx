import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthField, AuthPanel } from '@/components/shared/AuthPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage } from '@/lib/api/http'
import { authApi } from '@/lib/api/public'

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('invite') ?? searchParams.get('code') ?? searchParams.get('ref') ?? ''
  const [form, setForm] = useState({
    username: '',
    email: '',
    code: '',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [error, setError] = useState('')

  function setField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSendCode() {
    if (!form.email) {
      setError('请先填写邮箱')
      return
    }
    setSendingCode(true)
    setError('')
    try {
      await authApi.sendCode(form.email)
      setCodeSent(true)
      setCodeCooldown(60)
      const timer = setInterval(() => {
        setCodeCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSendingCode(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await authApi.register({ ...form, ...(inviteCode ? { invite_code: inviteCode } : {}) })
      navigate('/login')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPanel
      title='创建账号'
      description='使用邮箱验证码创建用户账号。'
      footer={
        <>
          <span>已有账号？</span>
          <Link className='font-medium text-brand underline-offset-4 hover:underline' to='/login'>
            去登录
          </Link>
        </>
      }
    >
      <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
        <AuthField label='用户名' htmlFor='register-username'>
          <Input
            id='register-username'
            value={form.username}
            onChange={(event) => setField('username', event.target.value)}
            autoComplete='username'
          />
        </AuthField>
        <AuthField label='邮箱' htmlFor='register-email'>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Input
              id='register-email'
              type='email'
              value={form.email}
              onChange={(event) => setField('email', event.target.value)}
              placeholder='用于账号验证和登录'
              autoComplete='email'
            />
            <Button
              type='button'
              variant='outline'
              className='shrink-0'
              onClick={handleSendCode}
              disabled={sendingCode || codeCooldown > 0}
            >
              {sendingCode ? '发送中...' : codeCooldown > 0 ? `${codeCooldown}s` : '获取验证码'}
            </Button>
          </div>
          {codeSent ? (
            <p className='text-xs text-muted-foreground'>验证码已发送到 {form.email}，有效期 5 分钟</p>
          ) : null}
        </AuthField>
        <AuthField label='邮箱验证码' htmlFor='register-code'>
          <Input
            id='register-code'
            value={form.code}
            onChange={(event) => setField('code', event.target.value)}
            placeholder='请输入收到的 6 位验证码'
            maxLength={6}
            inputMode='numeric'
            autoComplete='one-time-code'
          />
        </AuthField>
        <AuthField label='密码' htmlFor='register-password'>
          <Input
            id='register-password'
            type='password'
            value={form.password}
            onChange={(event) => setField('password', event.target.value)}
            autoComplete='new-password'
          />
        </AuthField>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button className='w-full' size='lg' type='submit' disabled={submitting}>
          {submitting ? '创建中...' : '创建账号'}
        </Button>
      </form>
    </AuthPanel>
  )
}
