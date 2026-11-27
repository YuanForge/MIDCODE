import { useSyncExternalStore } from 'react'
import { getRoleToken } from '@/lib/auth/storage'
import { AUTH_CHANGE, LOGIN_REQUEST, isLoginRequested, getAuthDialogMode } from '@/lib/auth/events'
export { AUTH_CHANGE, LOGIN_REQUEST, requestLogin, notifyAuthChange } from '@/lib/auth/events'
function subscribeLogin(callback: () => void) { window.addEventListener(LOGIN_REQUEST, callback); return () => window.removeEventListener(LOGIN_REQUEST, callback) }
export function useLoginRequested() { return useSyncExternalStore(subscribeLogin, isLoginRequested, () => false) }
export function useAuthDialogMode() { return useSyncExternalStore(subscribeLogin, getAuthDialogMode, () => null) }
function subscribe(callback: () => void) { window.addEventListener(AUTH_CHANGE,callback); window.addEventListener('storage',callback); return () => {window.removeEventListener(AUTH_CHANGE,callback);window.removeEventListener('storage',callback)} }
export function useRoleToken(role: 'user' | 'admin' | 'vendor' | 'reseller' = 'user') { return useSyncExternalStore(subscribe, () => getRoleToken(role), () => '') }
