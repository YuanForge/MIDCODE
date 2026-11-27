import { createHttpClient } from '@/lib/api/http'

type Role = 'user' | 'admin' | 'vendor' | 'reseller'

export type UploadImageCategory = 'reference' | 'channel-icon' | 'inspiration' | 'site-setting' | 'payment-qr'
export type UploadVideoCategory = 'reference-video' | 'inspiration-video'

const clients: Record<Role, ReturnType<typeof createHttpClient>> = {
  user: createHttpClient('user'),
  admin: createHttpClient('admin'),
  vendor: createHttpClient('vendor'),
  reseller: createHttpClient('reseller'),
}

export async function uploadAuthedImage(role: Role, file: File, category: UploadImageCategory) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', category)
  return clients[role].post<{ url?: string }>('/upload/image', formData)
}

export async function uploadAuthedVideo(role: Role, file: File, category: UploadVideoCategory) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', category)
  return clients[role].post<{ url?: string }>('/upload/video', formData)
}
