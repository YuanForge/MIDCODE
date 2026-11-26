import { useRef, useState } from 'react'
import { ImageIcon, PlusIcon, SaveIcon, VideoIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { InspirationRow } from '@/pages/admin/inspiration/InspirationRow'
import { newItem } from '@/pages/admin/inspiration/items'
import { INSPIRATION_GALLERY_SETTING_KEY, parseGalleryItems, type GalleryItem } from '@/pages/user/creation/inspiration'

/** The gallery shown in the creation center, edited as a ruled list of entries and saved in one go. */
export function AdminInspirationPage() {
  const { data: rawSettings, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.getSettings()
    return (res as { settings?: Record<string, string> }).settings ?? (res as Record<string, string>)
  }, {} as Record<string, string>)

  const [items, setItems] = useState<GalleryItem[]>([])
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState('')
  const [uploadTarget, setUploadTarget] = useState<{ id: string; type: GalleryItem['type'] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!loading && !ready) {
    setItems(parseGalleryItems(rawSettings[INSPIRATION_GALLERY_SETTING_KEY]))
    setReady(true)
  }

  function patchItem(id: string, patch: Partial<GalleryItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function save() {
    setSaving(true)
    try {
      await adminApi.updateSettings({ [INSPIRATION_GALLERY_SETTING_KEY]: JSON.stringify(items) })
      toast.success('灵感库已保存')
      reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function upload(file: File | undefined) {
    if (!file || !uploadTarget) return
    setUploadingId(uploadTarget.id)
    try {
      const res = uploadTarget.type === 'video' ? await adminApi.uploadVideo(file, 'inspiration-video') : await adminApi.uploadImage(file, 'inspiration')
      if (!res.url) throw new Error('上传失败，未返回媒体地址')
      patchItem(uploadTarget.id, { mediaUrl: res.url })
      toast.success('媒体上传成功')
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setUploadingId('')
      setUploadTarget(null)
    }
  }

  return (
    <>
      <PageHeader
        title='灵感库管理'
        description='编辑创作中心展示的图片和视频灵感，支持上传预览媒体。'
        actions={
          <Button onClick={() => void save()} disabled={saving || loading}>
            <SaveIcon data-icon='inline-start' />
            {saving ? '保存中...' : '保存灵感库'}
          </Button>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' onClick={() => setItems((prev) => [newItem('image'), ...prev])}>
          <ImageIcon data-icon='inline-start' />
          添加图片灵感
        </Button>
        <Button type='button' variant='outline' onClick={() => setItems((prev) => [newItem('video'), ...prev])}>
          <VideoIcon data-icon='inline-start' />
          添加视频灵感
        </Button>
      </div>

      <input
        ref={fileRef}
        type='file'
        accept={uploadTarget?.type === 'video' ? 'video/*' : 'image/*'}
        className='hidden'
        onChange={(event) => {
          void upload(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      <div className='glass overflow-hidden'>
        {loading || !ready ? (
          <div className='flex flex-col gap-3 p-4'>
            <Skeleton className='h-28 w-full' />
            <Skeleton className='h-28 w-full' />
          </div>
        ) : items.length === 0 ? (
          <p className='py-16 text-center text-sm text-muted-foreground'>暂无灵感内容，点击上方按钮添加。</p>
        ) : (
          <ol className='divide-y divide-glass-border'>
            {items.map((item, index) => (
              <InspirationRow
                key={item.id}
                item={item}
                index={index}
                uploading={uploadingId === item.id}
                onPatch={(patch) => patchItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
                onUpload={() => {
                  setUploadTarget({ id: item.id, type: item.type })
                  fileRef.current?.click()
                }}
              />
            ))}
          </ol>
        )}
      </div>

      <div className='flex justify-end'>
        <Button type='button' variant='outline' onClick={() => setItems((prev) => [...prev, newItem('image')])}>
          <PlusIcon data-icon='inline-start' />
          追加一条
        </Button>
      </div>
    </>
  )
}
