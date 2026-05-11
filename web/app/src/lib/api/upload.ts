import { createHttpClient } from '@/lib/api/http'

type Role = 'user' | 'admin' | 'vendor'

export type UploadImageCategory = 'reference' | 'channel-icon' | 'site-setting' | 'payment-qr'

const clients: Record<Role, ReturnType<typeof createHttpClient>> = {
  user: createHttpClient('user'),
  admin: createHttpClient('admin'),
  vendor: createHttpClient('vendor'),
}

export async function uploadAuthedImage(role: Role, file: File, category: UploadImageCategory) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', category)
  return clients[role].post<{ url?: string }>('/upload/image', formData)
}