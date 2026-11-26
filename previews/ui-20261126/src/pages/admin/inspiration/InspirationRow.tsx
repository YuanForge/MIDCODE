import { Trash2Icon, UploadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { GRADIENTS } from '@/pages/admin/inspiration/items'
import type { GalleryItem } from '@/pages/user/creation/inspiration'

/** One gallery entry: a preview on the left, its fields in the middle, upload and delete on the right. */
export function InspirationRow({
  item,
  index,
  uploading,
  onPatch,
  onRemove,
  onUpload,
}: {
  item: GalleryItem
  index: number
  uploading: boolean
  onPatch: (patch: Partial<GalleryItem>) => void
  onRemove: () => void
  onUpload: () => void
}) {
  const n = index + 1

  return (
    <li className='grid gap-3 p-4 lg:grid-cols-[180px_1fr_auto]'>
      <div className='w-full max-w-60 overflow-hidden rounded-xl border border-glass-border lg:max-w-none' style={{ aspectRatio: item.type === 'video' ? '16/9' : '4/3', background: item.gradient }}>
        {item.mediaUrl ? (
          item.type === 'video' ? (
            <video src={item.mediaUrl} controls className='h-full w-full object-cover' />
          ) : (
            <img src={item.mediaUrl} alt='' className='h-full w-full object-cover' />
          )
        ) : (
          <div className='grid h-full place-items-center text-xs text-white/80'>预览</div>
        )}
      </div>

      <div className='grid gap-3'>
        <div className='grid gap-2 md:grid-cols-[120px_1fr_1fr]'>
          <NativeSelect
            aria-label={`第 ${n} 条类型`}
            value={item.type}
            onChange={(event) => onPatch({ type: event.target.value as GalleryItem['type'], mediaUrl: '' })}
          >
            <option value='image'>图片</option>
            <option value='video'>视频</option>
          </NativeSelect>
          <Input aria-label={`第 ${n} 条分类`} value={item.category} onChange={(event) => onPatch({ category: event.target.value })} placeholder='分类' />
          <Input
            aria-label={`第 ${n} 条媒体地址`}
            value={item.mediaUrl ?? ''}
            onChange={(event) => onPatch({ mediaUrl: event.target.value })}
            placeholder='媒体 URL，可手填或上传'
          />
        </div>
        <Textarea
          aria-label={`第 ${n} 条提示词`}
          value={item.text}
          onChange={(event) => onPatch({ text: event.target.value })}
          rows={3}
          placeholder='提示词内容'
          className='resize-y'
        />
        <div className='flex flex-wrap items-center gap-3'>
          <label className='flex items-center gap-2 text-sm'>
            <input type='checkbox' checked={!!item.hot} onChange={(event) => onPatch({ hot: event.target.checked })} className='size-4 accent-primary' />
            热门
          </label>
          <Input
            aria-label={`第 ${n} 条点赞数`}
            value={item.likes ?? ''}
            onChange={(event) => onPatch({ likes: event.target.value })}
            placeholder='点赞数'
            className='h-8 w-28'
          />
          <NativeSelect aria-label={`第 ${n} 条渐变底色`} value={item.gradient} onChange={(event) => onPatch({ gradient: event.target.value })} className='h-8 w-56'>
            {GRADIENTS.map((gradient, i) => (
              <option key={gradient} value={gradient}>
                渐变 {i + 1}
              </option>
            ))}
          </NativeSelect>
          <span className='ml-auto text-xs tabular-nums text-muted-foreground'>#{n}</span>
        </div>
      </div>

      <div className='flex gap-2 lg:flex-col'>
        <Button type='button' variant='outline' size='sm' disabled={uploading} onClick={onUpload}>
          <UploadIcon data-icon='inline-start' />
          {uploading ? '上传中' : '上传'}
        </Button>
        <Button type='button' variant='outline' size='sm' className='text-destructive' onClick={onRemove}>
          <Trash2Icon data-icon='inline-start' />
          删除
        </Button>
      </div>
    </li>
  )
}
