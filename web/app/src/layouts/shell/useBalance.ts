import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { userApi } from '@/lib/api/user'

/**
 * The signed-in user's balance in micro-credits. It is read again whenever the route changes, so it follows a
 * top-up or a spend without a reload. Null means not known yet, or the read failed: callers show a dash, never a zero.
 */
export function useBalance(enabled: boolean) {
  const { pathname } = useLocation()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    userApi
      .getBalance()
      .then((res) => {
        if (!cancelled) setBalance(res.balance_credits ?? null)
      })
      .catch(() => {
        if (!cancelled) setBalance(null)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, pathname])

  return balance
}
