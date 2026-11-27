import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiErrorMessage } from '@/lib/api/http'
import { authApi } from '@/lib/api/public'
import { useAuthCopy } from '@/i18n/auth-copy'
import { useRegistrationCopy } from '@/i18n/registration-copy'
import { useTranslation } from 'react-i18next'

type RegisterPageProps = { embedded?: boolean; onLogin?: () => void; onSuccess?: () => void }
export function RegisterPage({ embedded = false, onLogin, onSuccess }: RegisterPageProps) {
  const navigate = useNavigate()
  const a = useAuthCopy()
  const copy = useRegistrationCopy()
  const { i18n } = useTranslation()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('invite') ?? searchParams.get('code') ?? searchParams.get('ref') ?? ''
  const emailInput = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ username: '', email: '', code: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [error, setError] = useState('')
  const busy = submitting || sendingCode

  useEffect(() => {
    if (!codeCooldown) return
    const timer = setTimeout(() => setCodeCooldown(value => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [codeCooldown])

  function errorMessage(err: unknown) {
    return i18n.language === 'zh-CN' ? getApiErrorMessage(err) : a.failed
  }
  async function handleSendCode() {
    if (!emailInput.current?.reportValidity()) { setError(copy.emailRequired); return }
    const email = form.email.trim()
    setSendingCode(true)
    setError('')
    try {
      await authApi.sendCode(email)
      setSentEmail(email)
      setCodeCooldown(60)
    } catch (err) { setError(errorMessage(err)) }
    finally { setSendingCode(false) }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await authApi.register({ ...form, email: form.email.trim(), code: form.code.trim(), ...(inviteCode ? { invite_code: inviteCode } : {}) })
      if (onSuccess) onSuccess()
      else navigate('/login')
    } catch (err) { setError(errorMessage(err)) }
    finally { setSubmitting(false) }
  }

  return (
    <Card className={embedded ? 'w-full border-0 shadow-none' : 'w-full max-w-[480px] shadow-lg'}>
      <CardHeader className="gap-2 px-6 pt-6 sm:px-8 sm:pt-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{a.register}</p>
        <CardTitle><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1></CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-username">{copy.username}</Label>
            <Input id="register-username" required minLength={3} maxLength={32} disabled={busy} value={form.username}
              onChange={event => setForm(current => ({ ...current, username: event.target.value }))} autoComplete="username" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-email">{a.email}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input ref={emailInput} id="register-email" type="email" required disabled={busy} value={form.email}
                onChange={event => setForm(current => ({ ...current, email: event.target.value, code: '' }))} autoComplete="email" />
              <Button type="button" variant="outline" className="shrink-0" onClick={handleSendCode} disabled={busy || codeCooldown > 0}>
                {sendingCode ? a.busy : codeCooldown > 0 ? `${a.resend} (${codeCooldown}s)` : a.send}
              </Button>
            </div>
            {sentEmail && sentEmail === form.email.trim() ? <p className="text-xs text-muted-foreground">{copy.sent}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-code">{a.code}</Label>
            <Input id="register-code" required disabled={busy} pattern="[0-9]{6}" value={form.code}
              onChange={event => setForm(current => ({ ...current, code: event.target.value }))}
              maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-password">{a.password}</Label>
            <Input id="register-password" type="password" required minLength={8} maxLength={128} disabled={busy} value={form.password}
              onChange={event => setForm(current => ({ ...current, password: event.target.value }))} autoComplete="new-password" />
          </div>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <Button className="w-full" type="submit" disabled={busy}>{submitting ? a.busy : copy.title}</Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center gap-1 px-6 py-4 text-sm text-muted-foreground sm:px-8">
        <span>{copy.existing}</span>
        <Link className="font-medium text-primary hover:underline" to="/login" onClick={event => { if (onLogin) { event.preventDefault(); onLogin() } }}>{a.login}</Link>
      </CardFooter>
    </Card>
  )
}
