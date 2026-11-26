import { createHttpClient } from './http'

const http = createHttpClient('user')

/** Order amounts are the price before any coupon: the server applies the coupon, charges the reduced amount and credits the full price. */
export const payApi = {
  createPayApplyOrder: (data: { amount: number; pay_flat: number; pay_from?: string; coupon_code?: string }) =>
    http.post<{ out_trade_no?: string; pay_url?: string; wechat_qr?: string; alipay_qr?: string }>('/pay/apply/create', data),
  createShouqianbaOrder: (data: { amount: number; pay_flat: number; coupon_code?: string }) =>
    http.post<{ out_trade_no?: string; pay_url?: string }>('/pay/shouqianba/create', data),
  createEpayOrder: (amount: number, type: string, couponCode?: string) =>
    http.post<{ pay_url?: string; out_trade_no?: string }>('/pay/epay/create', { amount, type, ...(couponCode ? { coupon_code: couponCode } : {}) }),
  getOrderStatus: (outTradeNo: string) =>
    http.get<{ status: string }>('/pay/order/status', { params: { out_trade_no: outTradeNo } }),
  validateCoupon: (code: string, amount: number) =>
    http.get<{ valid: boolean; coupon_id: number; discount_yuan: number; final_amount: number; discount_type: string; discount_value: number }>('/user/coupons/validate', { params: { code, amount } }),
}
