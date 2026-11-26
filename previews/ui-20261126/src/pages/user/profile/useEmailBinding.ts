import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { getApiErrorMessage } from '@/lib/api/http'
import { authApi } from '@/lib/api/public'
import { userApi } from '@/lib/api/user'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Email binding. When the account name is itself an email address it is the default address, derived
 * from the profile instead of being copied into state by an effect; typing replaces it.
 */
export function useEmailBinding({ username, onBound }: { username?: string; onBound: () => void }) {
  const isEmailUsername = EMAIL_PATTERN.test(username ?? '')
  const [draft, setDraft] = useState<string | null>(null)
  const email = draft ?? (isEmailUsername ? (username ?? '') : '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [binding, setBinding] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current)
    },
    [],
  )

  function fail(message: string) {
    setError(message)
    toast.error(message)
  }

  function startCountdown() {
    if (timerRef.current) clearInterval(timerRef.current)
    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return current - 1
      })
    }, 1000)
  }

  async function sendCode() {
    if (!email) {
      fail('请填写邮箱')
      return
    }
    setError('')
    try {
      await authApi.sendCode(email)
      toast.success('验证码已发送，请注意查收邮箱')
      startCountdown()
    } catch (err) {
      fail(getApiErrorMessage(err))
    }
  }

  async function bind() {
    if (!email || !code) {
      fail('请填写邮箱和验证码')
      return
    }
    setError('')
    setBinding(true)
    try {
      await userApi.bindEmail({ email, code })
      toast.success('邮箱绑定成功')
      setDraft(null)
      setCode('')
      onBound()
    } catch (err) {
      fail(getApiErrorMessage(err))
    } finally {
      setBinding(false)
    }
  }

  return { isEmailUsername, email, setEmail: setDraft, code, setCode, error, binding, countdown, sendCode, bind }
}
