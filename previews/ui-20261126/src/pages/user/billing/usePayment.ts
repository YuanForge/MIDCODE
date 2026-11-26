import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useSiteSettings } from '@/hooks/use-site-settings'
import { getApiErrorMessage } from '@/lib/api/http'
import { payApi } from '@/lib/api/pay'

export type PayMethod = 'wechat' | 'alipay'

type CreatedOrder = { pay_url?: string; out_trade_no?: string }

const isMobileBrowser = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
const isWeChatBrowser = () => /micromessenger/i.test(navigator.userAgent)

function openPaymentPage(url: string) {
  if (isMobileBrowser()) {
    window.location.href = url
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Online payment flow. It creates the order through whichever gateway the site has enabled, opens the
 * payment page, then polls the order every 3 seconds for up to 5 minutes. `onPaid` runs once the order is paid.
 */
export function usePayment({ method, onPaid }: { method: PayMethod; onPaid: () => void }) {
  const { settings } = useSiteSettings()
  const [paying, setPaying] = useState(false)
  const [payUrl, setPayUrl] = useState('')
  const [outTradeNo, setOutTradeNo] = useState('')
  const [frameOpen, setFrameOpen] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPaidRef = useRef(onPaid)

  useEffect(() => {
    onPaidRef.current = onPaid
  })

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const startPolling = useCallback(
    (tradeNo?: string) => {
      if (!tradeNo) return
      stopPolling()
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await payApi.getOrderStatus(tradeNo)
          if (res.status === 'paid') {
            toast.success('充值成功')
            stopPolling()
            setFrameOpen(false)
            onPaidRef.current()
          }
        } catch {
          // ignore polling errors
        }
      }, 3000)
      pollTimeoutRef.current = setTimeout(stopPolling, 300000) // 5 minutes at most
    },
    [stopPolling],
  )

  const begin = useCallback(
    (order: CreatedOrder) => {
      if (!order.pay_url) return
      setPayUrl(order.pay_url)
      setOutTradeNo(order.out_trade_no || '')
      setFrameOpen(!isMobileBrowser())
      startPolling(order.out_trade_no)
      openPaymentPage(order.pay_url)
    },
    [startPolling],
  )

  const pay = useCallback(
    async ({ selectedAmount, couponCode }: { selectedAmount: number | ''; couponCode?: string }) => {
      if (!selectedAmount || Number(selectedAmount) < 0.01) {
        toast.error('请输入有效的充值金额')
        return
      }
      setPaying(true)
      try {
        const payFlat = method === 'wechat' ? 1 : 2
        // The amount is the price before the coupon. The server applies the coupon and charges the reduced amount.
        const amount = Number(selectedAmount)
        if (settings.shouqianbaEnabled) {
          begin(await payApi.createShouqianbaOrder({ amount, pay_flat: payFlat, coupon_code: couponCode }))
        } else if (settings.payApplyEnabled) {
          const payFrom = isMobileBrowser() ? (method === 'wechat' && isWeChatBrowser() ? 'wapwx' : 'wap') : 'pc'
          begin(await payApi.createPayApplyOrder({ amount, pay_flat: payFlat, pay_from: payFrom, coupon_code: couponCode }))
        } else if (settings.epayEnabled) {
          begin(await payApi.createEpayOrder(amount, method === 'wechat' ? 'wxpay' : 'alipay', couponCode))
        }
      } catch (e) {
        toast.error(getApiErrorMessage(e) || '支付发起失败')
      } finally {
        setPaying(false)
      }
    },
    [begin, method, settings.epayEnabled, settings.payApplyEnabled, settings.shouqianbaEnabled],
  )

  return {
    paying,
    payUrl,
    outTradeNo,
    frameOpen,
    pay,
    onFrameOpenChange: (open: boolean) => {
      setFrameOpen(open)
      if (!open) stopPolling()
    },
  }
}
