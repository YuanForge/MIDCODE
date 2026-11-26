import { useState } from 'react'

import { getApiErrorMessage } from '@/lib/api/http'
import { payApi } from '@/lib/api/pay'

export type CouponResult = { discount_yuan: number; final_amount: number }

/**
 * Coupon check for the amount being paid. Editing the code clears the previous result, and the page calls
 * `reset` whenever the amount changes, so the discount on screen always belongs to the amount on screen.
 */
export function useCoupon(amount: number) {
  const [code, setCodeState] = useState('')
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<CouponResult | null>(null)
  const [error, setError] = useState('')

  function setCode(next: string) {
    setCodeState(next)
    setResult(null)
    setError('')
  }

  function reset() {
    setResult(null)
  }

  async function validate() {
    if (!code.trim()) return
    if (!amount || amount < 0.01) {
      setError('请先选择或输入充值金额')
      return
    }
    setValidating(true)
    setError('')
    setResult(null)
    try {
      const res = await payApi.validateCoupon(code.trim(), amount)
      setResult({ discount_yuan: res.discount_yuan, final_amount: res.final_amount })
    } catch (e) {
      setError(getApiErrorMessage(e) || '优惠券验证失败')
    } finally {
      setValidating(false)
    }
  }

  return { code, setCode, validating, result, error, validate, reset }
}
