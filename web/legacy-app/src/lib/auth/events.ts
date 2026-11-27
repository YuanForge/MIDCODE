export const AUTH_CHANGE = 'fanapi-auth-change'
export const LOGIN_REQUEST = 'fanapi-login-request'
export type AuthDialogMode = 'login' | 'register' | 'recover' | 'registered' | null
let authDialogMode: AuthDialogMode = null
export function getAuthDialogMode() { return authDialogMode }
export function isLoginRequested() { return authDialogMode !== null }
export function setAuthDialogMode(mode: AuthDialogMode) {
  authDialogMode = mode
  window.dispatchEvent(new Event(LOGIN_REQUEST))
}
export function setLoginRequested(open: boolean) {
  setAuthDialogMode(open ? 'login' : null)
}
export function requestLogin() { setLoginRequested(true) }
export function requestRegister() { setAuthDialogMode('register') }
export function notifyAuthChange() { window.dispatchEvent(new Event(AUTH_CHANGE)) }
