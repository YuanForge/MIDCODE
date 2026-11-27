import { createHttpClient } from '@/lib/api/http'

export type ModelPreference = {
  routing_model: string
  pinned: boolean
  favorite: boolean
}

const http = createHttpClient('user')

export const modelPreferencesApi = {
  list: () => http.get<{ preferences: ModelPreference[] }>('/user/model-preferences'),
  update: (routing_model: string, patch: Partial<Pick<ModelPreference, 'pinned' | 'favorite'>>) =>
    http.patch<ModelPreference>('/user/model-preferences', { routing_model, ...patch }),
}
