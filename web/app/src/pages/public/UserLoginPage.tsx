import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRightIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, UserRoundIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownDocument } from '@/components/shared/MarkdownDocument'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { getApiErrorMessage } from '@/lib/api/http'
import { authApi } from '@/lib/api/public'
import { setRoleToken, setSiteModePreference } from '@/lib/auth/storage'

const REMEMBER_LOGIN_KEY = 'fanapi:user-login:remembered'

type RememberedLogin = {
  username?: string
  password?: string
}

export function UserLoginPage() {
  const navigate = useNavigate()
  const { settings } = useSiteSettings()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(false)
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_LOGIN_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as RememberedLogin
      setUsername(saved.username ?? '')
      setPassword(saved.password ?? '')
      setRememberLogin(Boolean(saved.username || saved.password))
    } catch {
      window.localStorage.removeItem(REMEMBER_LOGIN_KEY)
    }
  }, [])

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
    <div className="w-full max-w-[420px]">
      {/* 顶部渐变装饰条 */}
      <div className="h-1 w-full rounded-t-2xl bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

      <div className="rounded-b-2xl border border-t-0 border-border/70 bg-card/95 shadow-2xl shadow-primary/8 backdrop-blur-sm">
        {/* 头部 */}
        <div className="px-8 pb-6 pt-8">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
            User sign in
          </p>
          <h2 className="text-[1.65rem] font-semibold tracking-tight text-foreground">
            登录用户控制台
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            管理 API Key、调用统计、账单余额和生成任务。
          </p>
        </div>

        {/* 分割线 */}
        <div className="mx-8 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* 表单区 */}
        <div className="px-8 py-6">
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-login-username" className="text-sm font-medium">
                用户名 / 邮箱
              </Label>
              <div className="relative">
                <UserRoundIcon className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="user-login-username"
                  className="h-11 rounded-xl border-border/80 pl-9 text-sm transition-colors focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="请输入用户名或邮箱"
                  autoComplete="username"
                  aria-invalid={Boolean(error)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="user-login-password" className="text-sm font-medium">
                  密码
                </Label>
                <Link
                  className="text-xs font-medium text-primary/70 transition-colors hover:text-primary"
                  to="/forgot-password"
                >
                  忘记密码？
                </Link>
              </div>
              <div className="relative">
                <KeyRoundIcon className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="user-login-password"
                  className="h-11 rounded-xl border-border/80 pl-9 pr-10 text-sm transition-colors focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword
                    ? <EyeOffIcon className="size-4" />
                    : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Checkbox
                  id="user-login-remember"
                  checked={rememberLogin}
                  onCheckedChange={(checked) => setRememberLogin(checked === true)}
                  aria-label="记住账户密码"
                />
                <Label htmlFor="user-login-remember" className="cursor-pointer text-sm font-normal">
                  记住账户密码
                </Label>
              </div>
              <div className="flex items-start gap-2 text-muted-foreground">
                <Checkbox
                  id="user-login-agreement"
                  className="mt-0.5"
                  checked={agreementAccepted}
                  onCheckedChange={(checked) => setAgreementAccepted(checked === true)}
                  aria-label="同意用户协议"
                />
                <span className="text-sm font-normal leading-5">
                  我已阅读并同意
                  {agreementContent ? (
                    <button
                      type="button"
                      className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                      onClick={(event) => {
                        event.preventDefault()
                        setAgreementOpen(true)
                      }}
                    >
                      《用户协议》
                    </button>
                  ) : settings.userAgreementUrl ? (
                    <a
                      className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                      href={settings.userAgreementUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      《用户协议》
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">《用户协议》</span>
                  )}
                </span>
              </div>
            </div>

            {error ? (
              <Alert variant="destructive" className="rounded-xl py-3">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm shadow-primary/20 transition-all hover:shadow-md hover:shadow-primary/25"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  登录中...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  登录
                  <ArrowRightIcon className="size-4" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
          <DialogContent className="max-h-[82vh] overflow-hidden sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>用户协议</DialogTitle>
            </DialogHeader>
            <div className="max-h-[calc(82vh-5rem)] overflow-auto rounded-lg border bg-background/60 p-4">
              <MarkdownDocument content={agreementContent} />
            </div>
          </DialogContent>
        </Dialog>

        {/* 底部注册区 */}
        <div className="flex items-center justify-center gap-1 rounded-b-2xl border-t border-border/50 bg-muted/30 px-8 py-4 text-sm text-muted-foreground">
          <span>还没有账号？</span>
          <Link
            to="/register"
            className="font-semibold text-primary transition-colors hover:text-primary/80"
          >
            立即注册
          </Link>
        </div>
      </div>
    </div>
  )
}
