import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from 'lucide-react'

import { AuthField, AuthPanel } from '@/components/shared/AuthPanel'
import { MarkdownDocument } from '@/components/shared/MarkdownDocument'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { getApiErrorMessage } from '@/lib/api/http'
import { authApi } from '@/lib/api/public'
import { setRoleToken, setSiteModePreference } from '@/lib/auth/storage'

const REMEMBER_LOGIN_KEY = 'fanapi:user-login:remembered'

type RememberedLogin = {
  username?: string
  password?: string
}

/** Reads the remembered login once, while the page is created, so no effect has to copy it into state. */
function readRemembered(): RememberedLogin | null {
  try {
    const raw = window.localStorage.getItem(REMEMBER_LOGIN_KEY)
    if (!raw) return null
    return JSON.parse(raw) as RememberedLogin
  } catch {
    try {
      window.localStorage.removeItem(REMEMBER_LOGIN_KEY)
    } catch {
      // storage is not available; there is nothing to clean up
    }
    return null
  }
}

const linkClass = 'font-medium text-brand underline-offset-4 hover:underline'

export function UserLoginPage() {
  const navigate = useNavigate()
  const { settings } = useSiteSettings()
  const [remembered] = useState(readRemembered)
  const [username, setUsername] = useState(remembered?.username ?? '')
  const [password, setPassword] = useState(remembered?.password ?? '')
  const [rememberLogin, setRememberLogin] = useState(Boolean(remembered?.username || remembered?.password))
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!agreementAccepted) {
      setError('请先阅读并同意用户协议')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const response = await authApi.login({ username, password })
      if (rememberLogin) {
        window.localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ username, password }))
      } else {
        window.localStorage.removeItem(REMEMBER_LOGIN_KEY)
      }
      setRoleToken('user', response.token)
      setSiteModePreference('user')
      navigate('/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const agreementContent = settings.userAgreementContent.trim()

  return (
    <AuthPanel
      title='登录用户端'
      description='管理 API Key、调用统计、账单余额和生成任务。'
      footer={
        <>
          <span>还没有账号？</span>
          <Link to='/register' className={linkClass}>
            立即注册
          </Link>
        </>
      }
    >
      <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
        <AuthField label='用户名 / 邮箱' htmlFor='user-login-username'>
          <Input
            id='user-login-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder='请输入用户名或邮箱'
            autoComplete='username'
            aria-invalid={Boolean(error)}
            required
          />
        </AuthField>

        <AuthField
          label='密码'
          htmlFor='user-login-password'
          aside={
            <Link className={`text-xs ${linkClass}`} to='/forgot-password'>
              忘记密码？
            </Link>
          }
        >
          <div className='relative'>
            <Input
              id='user-login-password'
              className='pr-10'
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder='请输入密码'
              autoComplete='current-password'
              aria-invalid={Boolean(error)}
              required
            />
            <button
              type='button'
              className='absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-140 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOffIcon className='size-4' /> : <EyeIcon className='size-4' />}
            </button>
          </div>
        </AuthField>

        <div className='flex flex-col gap-3 text-sm'>
          <div className='flex items-center gap-2 text-muted-foreground'>
            <Checkbox
              id='user-login-remember'
              checked={rememberLogin}
              onCheckedChange={(checked) => setRememberLogin(checked === true)}
              aria-label='记住账户密码'
            />
            <Label htmlFor='user-login-remember' className='cursor-pointer text-sm font-normal'>
              记住账户密码
            </Label>
          </div>
          <div className='flex items-start gap-2 text-muted-foreground'>
            <Checkbox
              id='user-login-agreement'
              className='mt-0.5'
              checked={agreementAccepted}
              onCheckedChange={(checked) => setAgreementAccepted(checked === true)}
              aria-label='同意用户协议'
            />
            <span className='text-sm leading-5 font-normal'>
              我已阅读并同意
              {agreementContent ? (
                <button
                  type='button'
                  className={linkClass}
                  onClick={(event) => {
                    event.preventDefault()
                    setAgreementOpen(true)
                  }}
                >
                  《用户协议》
                </button>
              ) : settings.userAgreementUrl ? (
                <a
                  className={linkClass}
                  href={settings.userAgreementUrl}
                  target='_blank'
                  rel='noreferrer'
                  onClick={(event) => event.stopPropagation()}
                >
                  《用户协议》
                </a>
              ) : (
                <span className='font-medium text-foreground'>《用户协议》</span>
              )}
            </span>
          </div>
        </div>

        {error ? (
          <Alert variant='destructive'>
            <AlertDescription className='text-sm'>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button className='w-full' type='submit' disabled={submitting}>
          {submitting ? (
            <>
              <LoaderCircleIcon className='animate-spin' data-icon='inline-start' />
              登录中...
            </>
          ) : (
            '登录'
          )}
        </Button>
      </form>

      <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
        <DialogContent className='max-h-[82vh] overflow-hidden sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>用户协议</DialogTitle>
            <DialogDescription className='sr-only'>阅读完整的用户协议内容</DialogDescription>
          </DialogHeader>
          <div className='max-h-[calc(82vh-5rem)] overflow-auto rounded-xl border border-glass-border bg-glass-strong/60 p-4'>
            <MarkdownDocument content={agreementContent} />
          </div>
        </DialogContent>
      </Dialog>
    </AuthPanel>
  )
}
