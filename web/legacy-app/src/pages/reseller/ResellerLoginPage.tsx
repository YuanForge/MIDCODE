import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { resellerAuthApi } from '@/lib/api/reseller'
import { getApiErrorMessage } from '@/lib/api/http'
import { setRoleToken, setSiteModePreference } from '@/lib/auth/storage'

export function ResellerLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await resellerAuthApi.login({ username, password })
      setRoleToken('reseller', response.token)
      setSiteModePreference('reseller')
      navigate('/reseller/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-xl border-border/70 bg-card/92 shadow-lg">
      <CardHeader>
        <CardTitle>登录代理商后台</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="用户名或邮箱"
            autoComplete="username"
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="密码"
            autoComplete="current-password"
          />
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? '登录中...' : '进入代理商后台'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
