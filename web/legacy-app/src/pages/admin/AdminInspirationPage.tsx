import { useRef, useState } from 'react'
import { ImageIcon, PlusIcon, SaveIcon, Trash2Icon, UploadIcon, VideoIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAsync } from '@/hooks/use-async'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import {
  INSPIRATION_GALLERY_SETTING_KEY,
  parseGalleryItems,
  type GalleryItem,
} from '@/pages/user/creation/inspiration'

const gradients = [
  'linear-gradient(135deg,#1f3a5f,#4a90c2)',
  'linear-gradient(140deg,#0f2027,#2c5364)',
  'linear-gradient(135deg,#134e5e,#71b280)',
  'linear-gradient(135deg,#3a1c71,#d76d77 60%,#ffaf7b)',
]

function newItem(type: GalleryItem['type']): GalleryItem {
  return {
    id: `${type}-${Date.now()}`,
    type,
    category: type === 'image' ? '图片灵感' : '视频灵感',
    text: '',
    gradient: gradients[0],
    mediaUrl: '',
    hot: false,
    likes: '',
  }
}

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
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function save() {
    setSaving(true)
    try {
      await adminApi.updateSettings({
        [INSPIRATION_GALLERY_SETTING_KEY]: JSON.stringify(items),
      })
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
      const res = uploadTarget.type === 'video'
        ? await adminApi.uploadVideo(file, 'inspiration-video')
        : await adminApi.uploadImage(file, 'inspiration')
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
        eyebrow="Creation"
        title="灵感库管理"
        description="编辑创作中心展示的图片和视频灵感，支持上传预览媒体。"
        actions={
          <Button onClick={save} disabled={saving || loading}>
            <SaveIcon data-icon="inline-start" />
            {saving ? '保存中...' : '保存灵感库'}
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [newItem('image'), ...prev])}>
              <ImageIcon data-icon="inline-start" /> 添加图片灵感
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [newItem('video'), ...prev])}>
              <VideoIcon data-icon="inline-start" /> 添加视频灵感
            </Button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={uploadTarget?.type === 'video' ? 'video/*' : 'image/*'}
            className="hidden"
            onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }}
          />

          {loading || !ready ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              暂无灵感内容，点击上方按钮添加。
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={item.id} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[180px_1fr_auto]">
                  <div className="overflow-hidden rounded-lg border bg-muted/30" style={{ aspectRatio: item.type === 'video' ? '16/9' : '4/3', background: item.gradient }}>
                    {item.mediaUrl ? (
                      item.type === 'video' ? (
                        <video src={item.mediaUrl} controls className="h-full w-full object-cover" />
                      ) : (
                        <img src={item.mediaUrl} alt="" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-white/80">预览</div>
                    )}
                  </div>

                  <div className="grid gap-3">
                    <div className="grid gap-2 md:grid-cols-[120px_1fr_1fr]">
                      <NativeSelect
                        value={item.type}
                        onChange={(e) => patchItem(item.id, { type: e.target.value as GalleryItem['type'], mediaUrl: '' })}
                      >
                        <option value="image">图片</option>
                        <option value="video">视频</option>
                      </NativeSelect>
                      <Input value={item.category} onChange={(e) => patchItem(item.id, { category: e.target.value })} placeholder="分类" />
                      <Input value={item.mediaUrl ?? ''} onChange={(e) => patchItem(item.id, { mediaUrl: e.target.value })} placeholder="媒体 URL，可手填或上传" />
                    </div>
                    <Textarea
                      value={item.text}
                      onChange={(e) => patchItem(item.id, { text: e.target.value })}
                      rows={3}
                      placeholder="提示词内容"
                      className="resize-y"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!item.hot}
                          onChange={(e) => patchItem(item.id, { hot: e.target.checked })}
                          className="h-4 w-4 rounded border-border"
                        />
                        热门
                      </label>
                      <Input
                        value={item.likes ?? ''}
                        onChange={(e) => patchItem(item.id, { likes: e.target.value })}
                        placeholder="点赞数"
                        className="h-8 w-28"
                      />
                      <NativeSelect
                        value={item.gradient}
                        onChange={(e) => patchItem(item.id, { gradient: e.target.value })}
                        className="h-8 w-56"
                      >
                        {gradients.map((g, i) => <option key={g} value={g}>渐变 {i + 1}</option>)}
                      </NativeSelect>
                      <span className="ml-auto text-xs text-muted-foreground">#{index + 1}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 lg:flex-col">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingId === item.id}
                      onClick={() => {
                        setUploadTarget({ id: item.id, type: item.type })
                        fileRef.current?.click()
                      }}
                    >
                      <UploadIcon data-icon="inline-start" />
                      {uploadingId === item.id ? '上传中' : '上传'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeItem(item.id)}>
                      <Trash2Icon data-icon="inline-start" /> 删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setItems((prev) => [...prev, newItem('image')])}>
              <PlusIcon data-icon="inline-start" /> 追加一条
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
