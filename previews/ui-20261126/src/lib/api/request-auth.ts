import type { ApiKeyRecord } from '@/lib/api/user'
import { getRoleToken } from '@/lib/auth/storage'

function selectedRawKey(apiKeys: ApiKeyRecord[], selectedKeyId?: number) {
  const key = apiKeys.find((item) => item.id === selectedKeyId)
  return key?.raw_key || key?.key || ''
}

export function canInvokeWithSelectedKey(apiKeys: ApiKeyRecord[], selectedKeyId?: number) {
  if (selectedRawKey(apiKeys, selectedKeyId)) {
    return true
  }
  return Boolean(selectedKeyId && getRoleToken('user'))
}

export function buildUserInvokeHeaders(apiKeys: ApiKeyRecord[], selectedKeyId?: number) {
  const rawKey = selectedRawKey(apiKeys, selectedKeyId)
  if (rawKey) {
    return { Authorization: `Bearer ${rawKey}` } as Record<string, string>
  }

  const jwt = getRoleToken('user')
  if (!jwt || !selectedKeyId) {
    return null
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
  }
  headers['X-API-Key-Id'] = String(selectedKeyId)
  return headers
}
