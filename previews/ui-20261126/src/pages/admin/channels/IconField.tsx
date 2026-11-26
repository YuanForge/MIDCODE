import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

/** An icon URL that can also be filled by uploading an image. An upload that fails says why under the field. */
export function IconField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const picker = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const response = await adminApi.uploadImage(file, 'channel-icon')
      const url = response.url ?? ''
      if (!url) throw new Error('上传失败，未返回图片地址')
      onChange(url)
      toast.success('渠道图标上传成功')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor='channel-icon'>图标 URL</Label>
      <div className='flex gap-2'>
        <Input id='channel-icon' value={value} onChange={(event) => onChange(event.target.value)} placeholder='https://…/icon.png' />
        <input
          ref={picker}
          type='file'
          accept='image/*'
          className='hidden'
          aria-label='选择图标文件'
          onChange={(event) => {
            void upload(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <Button type='button' variant='outline' onClick={() => picker.current?.click()} disabled={uploading}>
          {uploading ? '上传中…' : '上传'}
        </Button>
      </div>
      {error ? (
        <p role='alert' className='text-xs text-destructive'>
          {error}
        </p>
      ) : null}
      {value ? (
        <div className='flex size-14 items-center justify-center overflow-hidden rounded-md border border-glass-border p-1'>
          <img src={value} alt='渠道图标预览' className='max-h-full max-w-full object-contain' />
        </div>
      ) : null}
    </div>
  )
}
