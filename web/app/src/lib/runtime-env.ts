export type RuntimePublicSettings = Record<string, unknown>

declare global {
  interface Window {
    __FANAPI_ENV__?: RuntimePublicSettings
  }
}

function readRuntimeEnv(): RuntimePublicSettings {
  if (typeof window === 'undefined') return {}
  const value = window.__FANAPI_ENV__
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

const runtimeEnv = readRuntimeEnv()

export function getRuntimeValue(key: string): unknown {
  return runtimeEnv[key]
}

export function getRuntimeString(key: string, fallback = ''): string {
  const value = getRuntimeValue(key)
  if (value === undefined || value === null) return fallback
  const text = String(value)
  return text.trim() === '' ? fallback : text
}

export function getRuntimeBoolean(key: string, fallback: boolean): boolean {
  const value = getRuntimeValue(key)
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}
