import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

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
    (error) => {
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

/**
 * True when a request may have reached the server although no answer came back from it: the connection dropped,
 * the request timed out, or a gateway in between answered in the server's place. After a write, the caller cannot
 * tell whether it was applied.
 */
export function isOutcomeUnknown(error: unknown) {
  if (!axios.isAxiosError(error)) return false
  return !error.response || [502, 503, 504].includes(error.response.status)
}
