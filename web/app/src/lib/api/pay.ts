import { createHttpClient } from './http'

const http = createHttpClient('user')

export const payApi = {
  createPayApplyOrder: (data: { amount: number; pay_flat: number; pay_from?: string }) =>
    http.post<{ out_trade_no?: string; pay_url?: string; wechat_qr?: string; alipay_qr?: string }>('/pay/apply/create', data),
  createShouqianbaOrder: (data: { amount: number; pay_flat: number }) =>
    http.post<{ out_trade_no?: string; pay_url?: string }>('/pay/shouqianba/create', data),
  createEpayOrder: (amount: number, type: string) =>
    http.post<{ pay_url?: string; out_trade_no?: string }>('/pay/epay/create', { amount, type }),
  getOrderStatus: (outTradeNo: string) =>
    http.get<{ status: string }>('/pay/order/status', { params: { out_trade_no: outTradeNo } }),
  validateCoupon: (code: string, amount: number) =>
    http.get<{ valid: boolean; coupon_id: number; discount_yuan: number; final_amount: number; discount_type: string; discount_value: number }>('/user/coupons/validate', { params: { code, amount } }),
}
