import axios from 'axios'
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { requestCaptcha, type CaptchaPurpose } from '@/lib/auth/captcha'

import { clearRoleToken, getRoleToken } from '@/lib/auth/storage'

type Role = 'user' | 'admin' | 'vendor' | 'reseller'

type HttpClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) => Promise<T>
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<T>
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<T>
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<T>
  delete: <T>(url: string, config?: AxiosRequestConfig) => Promise<T>
}

export function createHttpClient(role?: Role): HttpClient {
  const client = axios.create({
    baseURL: '/api',
    timeout: 30000,
  })

  client.interceptors.request.use((config) => {
    if (role) {
      const token = getRoleToken(role)
      if (token) config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config as (InternalAxiosRequestConfig & { captchaRetried?: boolean }) | undefined
      const purposes: Record<string, CaptchaPurpose> = {
        '/auth/login': 'login', '/auth/send-code': 'send_code', '/auth/forgot-password': 'reset_email',
      }
      const purpose = config?.url ? purposes[config.url] : undefined
      if (config && purpose && error.response?.data?.code === 'CAPTCHA_REQUIRED' && !config.captchaRetried) {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
        const subject = purpose === 'login' ? (payload?.username || payload?.email) : payload?.email
        if (typeof subject === 'string' && subject.trim()) {
          const token = await requestCaptcha(purpose, subject.trim())
          config.captchaRetried = true
          config.data = JSON.stringify({ ...payload, captcha_token: token })
          return client.request(config)
        }
      }
      if (error.response?.status === 401 && role) {
        clearRoleToken(role)
        const loginPaths: Record<string, string> = {
          user: '/login',
          admin: '/admin/login',
          vendor: '/vendor/login',
          reseller: '/reseller/login',
        }
        const loginPath = loginPaths[role]
        if (loginPath && !window.location.pathname.startsWith(loginPath)) {
          window.location.href = loginPath
        }
      }

      return Promise.reject(error)
    }
  )

  return {
    get: async <T>(url: string, config?: AxiosRequestConfig) =>
      (await client.get<T>(url, config)).data,
    post: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
      (await client.post<T>(url, data, config)).data,
    put: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
      (await client.put<T>(url, data, config)).data,
    patch: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
      (await client.patch<T>(url, data, config)).data,
    delete: async <T>(url: string, config?: AxiosRequestConfig) =>
      (await client.delete<T>(url, config)).data,
  }
}

export function getApiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.message || '请求失败'
  }
  if (error instanceof Error) return error.message
  return '请求失败'
}
