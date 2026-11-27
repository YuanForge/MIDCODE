import { useAuthCopy } from '@/i18n/auth-copy'
import { notifyAuthChange } from '@/hooks/use-role-token'
import { setLoginRequested } from '@/lib/auth/events'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRightIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, LoaderCircleIcon, UserRoundIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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

export function UserLoginPage({ onSuccess, onRecover, onRegister, embedded = false }: { onSuccess?: () => void; onRecover?: () => void; onRegister?: () => void; embedded?: boolean }) {
  const a = useAuthCopy()
  const navigate = useNavigate()
  const { settings } = useSiteSettings()
  const [saved] = useState<RememberedLogin>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(REMEMBER_LOGIN_KEY) || '{}')
      return { username: typeof value?.username === 'string' ? value.username : '', password: typeof value?.password === 'string' ? value.password : '' }
    } catch { return {} }
  })
  const [username, setUsername] = useState(saved.username ?? '')
  const [password, setPassword] = useState(saved.password ?? '')
  const [rememberLogin, setRememberLogin] = useState(Boolean(saved.username || saved.password))
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!agreementAccepted) {
      setError(a.agreeError)
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
      notifyAuthChange()
      if (onSuccess) { onSuccess(); return }
      const next = new URLSearchParams(window.location.search).get('next') || '/dashboard'
      const allowed = new Set(['/dashboard','/models','/docs','/tutorial','/keys','/billing','/profile','/invite','/stats','/tasks','/llm-logs','/playground','/creation','/image-gen','/video-gen','/music-gen','/recharge','/exchange'])
      navigate(allowed.has(next.split('?')[0]) ? next : '/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err) === '用户名或密码错误' ? a.invalid : a.failed)
    } finally {
      setSubmitting(false)
    }
  }

  const agreementContent = settings.userAgreementContent.trim()

  return (
    <Card className={embedded ? "w-full border-0 shadow-none" : "w-full max-w-[440px] shadow-lg"}>
      <CardHeader className="gap-2 px-6 pt-6 sm:px-8 sm:pt-8">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
            {a.login}
          </p>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{a.loginTitle}</h1>
          </CardTitle>
          <CardDescription>
            {a.loginDesc}
          </CardDescription>
      </CardHeader>

      <CardContent className="px-6 sm:px-8">
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-login-username" className="text-sm font-medium">
                {a.username}
              </Label>
              <div className="relative">
                <UserRoundIcon className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="user-login-username"
                  className="h-11 rounded-xl border-border/80 pl-9 text-sm transition-colors focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={a.username}
                  autoComplete="username"
                  aria-invalid={Boolean(error)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="user-login-password" className="text-sm font-medium">
                  {a.password}
                </Label>
                <Link
                  className="text-xs font-medium text-primary/70 transition-colors hover:text-primary"
                  to="/forgot-password"
                  onClick={event => { if (onRecover) { event.preventDefault(); onRecover() } }}
                >
                  {a.forgot}
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
                  placeholder={a.password}
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? a.hide : a.show}
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
                  aria-label={a.remember}
                />
                <Label htmlFor="user-login-remember" className="cursor-pointer text-sm font-normal">
                  {a.remember}
                </Label>
              </div>
              <div className="flex items-start gap-2 text-muted-foreground">
                <Checkbox
                  id="user-login-agreement"
                  className="mt-0.5"
                  checked={agreementAccepted}
                  onCheckedChange={(checked) => setAgreementAccepted(checked === true)}
                  aria-label={a.agreement}
                />
                <span className="text-sm font-normal leading-5">
                  {a.agree}
                  {agreementContent ? (
                    <button
                      type="button"
                      className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                      onClick={(event) => {
                        event.preventDefault()
                        setAgreementOpen(true)
                      }}
                    >
                      {a.agreement}
                    </button>
                  ) : settings.userAgreementUrl ? (
                    <a
                      className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                      href={settings.userAgreementUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {a.agreement}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{a.agreement}</span>
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
              className="w-full"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  {a.busy}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  {a.login}
                  <ArrowRightIcon data-icon="inline-end" />
                </span>
              )}
            </Button>
          </form>
      </CardContent>

        <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
          <DialogContent className="max-h-[82vh] overflow-hidden sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{a.agreement}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[calc(82vh-5rem)] overflow-auto rounded-lg border bg-background/60 p-4">
              <MarkdownDocument content={agreementContent} />
            </div>
          </DialogContent>
        </Dialog>

      <CardFooter className="justify-center gap-1 px-6 py-4 text-sm text-muted-foreground sm:px-8">
          <span>{a.noAccount}</span>
          <Link
            to="/register"
            onClick={event => { if (onRegister) { event.preventDefault(); onRegister() } else if (embedded) setLoginRequested(false) }}
            className="font-semibold text-primary transition-colors hover:text-primary/80"
          >
            {a.register}
          </Link>
      </CardFooter>
    </Card>
  )
}
