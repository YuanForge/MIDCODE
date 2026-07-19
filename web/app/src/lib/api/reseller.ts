import { createHttpClient } from '@/lib/api/http'

const http = createHttpClient('reseller')

export type ResellerProfile = {
  id?: number
  user_id?: number
  name?: string
  contact_name?: string
  phone?: string
  notes?: string
  is_active?: boolean
  username?: string
  email?: string | null
  key_count?: number
  site_count?: number
  created_at?: string
  updated_at?: string
}

export type ResellerKey = {
  id?: number
  name?: string
  key_type?: string
  key_prefix?: string
  raw_key?: string
  viewable?: boolean
  is_active?: boolean
  site_count?: number
  last_used_at?: string | null
  created_at?: string
}

export type ResellerModelGroup = {
  id?: number
  code?: string
  name?: string
  model_count?: number
}

export type ResellerSite = {
  id?: number
  reseller_id?: number
  user_id?: number
  api_key_id?: number
  site_name?: string
  logo_url?: string
  domain?: string
  site_code?: string
  db_name?: string
  redis_db?: number
  app_port?: number
  nats_namespace?: string
  code_path?: string
  public_url?: string
  status?: string
  profit_ratio?: number
  smtp_host?: string
  smtp_port?: number
  smtp_user?: string
  smtp_from?: string
  last_error?: string
  created_at?: string
  updated_at?: string
}

export type ResellerBuildJob = {
  id?: number
  site_id?: number
  reseller_id?: number
  status?: string
  step?: string
  error?: string
  resources?: Record<string, unknown>
  started_at?: string
  finished_at?: string
  created_at?: string
  updated_at?: string
}

export type CreateResellerSitePayload = {
  api_key_id?: number
  site_name: string
  logo_url?: string
  domain?: string
  profit_ratio?: number
  smtp_host: string
  smtp_port?: number
  smtp_user: string
  smtp_password: string
  smtp_from: string
}

export const resellerAuthApi = {
  login: (payload: { username: string; password: string }) =>
    http.post<{ token: string; reseller?: ResellerProfile }>('/reseller/auth/login', payload),
}

export const resellerApi = {
  getProfile: () => http.get<ResellerProfile>('/reseller/profile'),
  getKeys: () =>
    http.get<{ keys?: ResellerKey[]; items?: ResellerKey[] } | ResellerKey[]>('/reseller/keys'),
  listModelGroups: () =>
    http.get<{ groups?: ResellerModelGroup[] }>('/user/model-groups'),
  createKey: (payload: { name: string; group_ids: number[] }) =>
    http.post<{ key?: string; note?: string }>('/reseller/keys', payload),
  getSites: () =>
    http.get<{ sites?: ResellerSite[]; items?: ResellerSite[] } | ResellerSite[]>('/reseller/sites'),
  createSite: (payload: CreateResellerSitePayload) =>
    http.post<{ site?: ResellerSite; job?: ResellerBuildJob }>('/reseller/sites', payload),
  getBuildProgress: (siteId: number) =>
    http.get<{ site?: ResellerSite; jobs?: ResellerBuildJob[] }>(`/reseller/sites/${siteId}/build-progress`),
}
