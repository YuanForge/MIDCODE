type Role = 'user' | 'admin' | 'vendor' | 'reseller'

const TOKEN_KEYS: Record<Role, string> = {
  user: 'token',
  admin: 'admin_token',
  vendor: 'vendor_token',
  reseller: 'reseller_token',
}

const MODE_KEY = 'fanapi_ui_mode'
const DARK_KEY = 'dark_mode'

export function getRoleToken(role: Role) {
  return window.localStorage.getItem(TOKEN_KEYS[role]) ?? ''
}

export function setRoleToken(role: Role, value: string) {
  window.localStorage.setItem(TOKEN_KEYS[role], value)
}

export function clearRoleToken(role: Role) {
  window.localStorage.removeItem(TOKEN_KEYS[role])
}

export function getSiteModePreference() {
  // sessionStorage: per-tab，每个标签页独立；未设置时回退到 localStorage 历史值
  return window.sessionStorage.getItem(MODE_KEY)
    ?? window.localStorage.getItem(MODE_KEY)
    ?? 'user'
}

export function setSiteModePreference(mode: Role) {
  window.sessionStorage.setItem(MODE_KEY, mode)
  window.localStorage.setItem(MODE_KEY, mode)
}

export function isDarkModeEnabled() {
  return window.localStorage.getItem(DARK_KEY) === 'true'
}

export function setDarkMode(enabled: boolean) {
  window.localStorage.setItem(DARK_KEY, String(enabled))
  document.documentElement.classList.toggle('dark', enabled)
}
