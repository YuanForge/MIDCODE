export type CaptchaPurpose = 'login' | 'send_code' | 'reset_email'
export type CaptchaRequest = { id: number; purpose: CaptchaPurpose; subject: string }
let pending: CaptchaRequest | null = null
let serial = 0
let resolvePending: ((token: string) => void) | undefined
let rejectPending: ((error: Error) => void) | undefined
let timeout: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
export const subscribeCaptcha = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getCaptchaRequest = () => pending
export function requestCaptcha(purpose: CaptchaPurpose, subject: string): Promise<string> {
  if (pending) return Promise.reject(new Error('请先完成当前人机验证'))
  return new Promise((resolve, reject) => {
    resolvePending = resolve
    rejectPending = reject
    pending = { id: ++serial, purpose, subject }
    timeout = setTimeout(() => finishCaptcha(), 5 * 60 * 1000)
    listeners.forEach(listener => listener())
  })
}
export function finishCaptcha(token?: string) {
  const resolve = resolvePending, reject = rejectPending
  pending = null
  resolvePending = undefined
  rejectPending = undefined
  clearTimeout(timeout)
  listeners.forEach(listener => listener())
  if (token) resolve?.(token)
  else reject?.(new Error('人机验证已取消或过期，请重试'))
}
