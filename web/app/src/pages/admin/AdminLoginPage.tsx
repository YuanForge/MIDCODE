import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightIcon, ShieldCheckIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminAuthApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { setRoleToken, setSiteModePreference } from '@/lib/auth/storage'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await adminAuthApi.login({ username, password })
      setRoleToken('admin', response.token)
      setSiteModePreference('admin')
      navigate('/admin/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-[440px] shadow-lg">
      <CardHeader className="gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
        <Badge variant="secondary" className="w-fit">
          <ShieldCheckIcon data-icon="inline-start" />
          Admin access
        </Badge>
        <div className="flex flex-col gap-2">
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">登录管理后台</h1>
          </CardTitle>
          <CardDescription>
            进入运营、用户、渠道、账务和系统配置中心。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-login-username">管理员账号</Label>
            <Input
              id="admin-login-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入管理员账号"
              autoComplete="username"
              aria-invalid={Boolean(error)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-login-password">密码</Label>
            <Input
              id="admin-login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              required
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? '登录中...' : '进入后台'}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center px-6 py-4 text-center text-xs text-muted-foreground sm:px-8">
        管理后台使用独立权限入口，请确认账号来源可信。
      </CardFooter>
    </Card>
  )
}
