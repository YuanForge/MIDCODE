import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { getApiErrorMessage } from '@/lib/api/http'
import { modelPreferencesApi, type ModelPreference } from '@/lib/api/model-preferences'
import { getRoleToken } from '@/lib/auth/storage'

function subscribe(callback: () => void) {
  window.addEventListener('fanapi-auth-change', callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener('fanapi-auth-change', callback)
    window.removeEventListener('storage', callback)
  }
}

const emptyPreferences = new Map<string, ModelPreference>()

export function useModelPreferences() {
  const token = useSyncExternalStore(subscribe, () => getRoleToken('user'), () => '')
  const [state, setState] = useState({ token: '', preferences: emptyPreferences, ready: false, error: '' })
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const locks = useRef(new Set<string>())

  useEffect(() => {
    if (!token) return
    let cancelled = false
    modelPreferencesApi.list().then(({ preferences }) => {
      if (!cancelled) setState({ token, preferences: new Map(preferences.map(item => [item.routing_model, item])), ready: true, error: '' })
    }).catch(error => {
      if (!cancelled) setState({ token, preferences: emptyPreferences, ready: false, error: getApiErrorMessage(error) })
    })
    return () => { cancelled = true }
  }, [token, revision])

  const owned = state.token === token && !!token
  const preferences = owned ? state.preferences : emptyPreferences

  async function toggle(model: string, field: 'pinned' | 'favorite') {
    if (!token) {
      toast.error('请先登录，再收藏或置顶常用模型')
      return
    }
    const key = `${token}:${model}`
    if (!owned || !state.ready || locks.current.has(key)) return
    locks.current.add(key)
    setPending(new Set(locks.current))
    try {
      const preference = await modelPreferencesApi.update(model, { [field]: !preferences.get(model)?.[field] })
      if (getRoleToken('user') !== token) return
      setState(current => {
        if (current.token !== token) return current
        const next = new Map(current.preferences)
        next.set(model, preference)
        return { ...current, preferences: next }
      })
    } catch (error) {
      if (getRoleToken('user') === token) toast.error(getApiErrorMessage(error))
    } finally {
      locks.current.delete(key)
      setPending(new Set(locks.current))
    }
  }

  return {
    preferences,
    authenticated: !!token,
    loading: !!token && (!owned || (!state.ready && !state.error)),
    error: owned ? state.error : '',
    disabled: (model: string) => !!token && (!owned || !state.ready || pending.has(`${token}:${model}`)),
    toggle,
    retry: () => setRevision(value => value + 1),
  }
}
