import type { GalleryItem } from '@/pages/user/creation/inspiration'

export const GRADIENTS = [
  'linear-gradient(135deg,#1f3a5f,#4a90c2)',
  'linear-gradient(140deg,#0f2027,#2c5364)',
  'linear-gradient(135deg,#134e5e,#71b280)',
  'linear-gradient(135deg,#3a1c71,#d76d77 60%,#ffaf7b)',
]

export function newItem(type: GalleryItem['type']): GalleryItem {
  return {
    id: `${type}-${Date.now()}`,
    type,
    category: type === 'image' ? '图片灵感' : '视频灵感',
    text: '',
    gradient: GRADIENTS[0],
    mediaUrl: '',
    hot: false,
    likes: '',
  }
}
