import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <Card className="w-full max-w-[440px] shadow-lg">
      <CardHeader className="gap-2 px-6 pt-6 sm:px-8 sm:pt-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Password recovery
        </p>
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">找回密码</h1>
        </CardTitle>
        <CardDescription>输入账号绑定邮箱以获取密码重置指引。</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="forgot-password-email">邮箱</Label>
            <Input
              id="forgot-password-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="请输入账号绑定邮箱"
              autoComplete="email"
            />
          </div>
          {message ? (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? '提交中...' : '发送重置指引'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center px-6 py-4 text-sm text-muted-foreground sm:px-8">
        <Link className="hover:text-foreground" to="/login">
          返回登录
        </Link>
      </CardFooter>
    </Card>
  )
}
