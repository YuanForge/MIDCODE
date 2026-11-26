import { useMemo, useRef, useState } from 'react'
import { UploadIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { splitLines } from '@/pages/user/video/videoModel'

type Kind = 'image' | 'video'

const COPY: Record<Kind, { noun: string; unit: string; accept: string; sample: string }> = {
  image: {
    noun: '参考图',
    unit: '张',
    accept: 'image/*',
    sample: 'https://example.com/ref1.png\nhttps://example.com/ref2.png',
  },
  video: {
    noun: '参考视频',
    unit: '个',
    accept: 'video/*',
    sample: 'https://example.com/ref1.mp4\nhttps://example.com/ref2.mp4',
  },
}

/** A list of reference addresses, one per line, that can also be filled by uploading local files. */
export function ReferenceField({
  id,
  kind,
  value,
  onChange,
  onAppend,
  onError,
  upload,
}: {
  id: string
  kind: Kind
  value: string
  onChange: (next: string) => void
  onAppend: (urls: string[]) => void
  onError: (message: string) => void
  upload: (file: File) => Promise<{ url?: string }>
}) {
  const copy = COPY[kind]
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const urls = useMemo(() => splitLines(value), [value])

  async function uploadFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    setUploading(true)
    onError('')
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const response = await upload(file)
        if (response.url) uploaded.push(response.url)
      }
      if (uploaded.length === 0) throw new Error(`上传失败，未返回${copy.noun}地址`)
      onAppend(uploaded)
      toast.success(`已上传 ${uploaded.length} ${copy.unit}${copy.noun}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : `${copy.noun}上传失败`
      onError(message)
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Label htmlFor={id}>
          {copy.noun} URL <span className='font-normal text-muted-foreground'>(选填，每行一条)</span>
        </Label>
        <input
          ref={inputRef}
          type='file'
          accept={copy.accept}
          multiple
          className='hidden'
          onChange={(event) => {
            void uploadFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <Button type='button' size='sm' variant='outline' onClick={() => inputRef.current?.click()} disabled={uploading}>
          <UploadIcon data-icon='inline-start' />
          {uploading ? '上传中...' : '本地上传'}
        </Button>
      </div>
      <Textarea id={id} rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={copy.sample} />
      {urls.length > 0 ? (
        <ul className={kind === 'image' ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
          {urls.map((url) => (
            <li key={url} className='overflow-hidden rounded-md border border-glass-border bg-glass-strong/40'>
              {kind === 'image' ? (
                <img src={url} alt='reference' className='h-32 w-full object-cover' />
              ) : (
                <video src={url} controls className='aspect-video w-full bg-code' />
              )}
              <p className='truncate px-3 py-2 text-xs text-muted-foreground'>{url}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
