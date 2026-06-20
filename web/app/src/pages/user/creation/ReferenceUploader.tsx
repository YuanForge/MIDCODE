import { useRef, useState } from 'react'
import { UploadIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { userApi } from '@/lib/api/user'
import { Field } from './controls'
import { splitLines } from './media'

type UploadKind = 'image' | 'video'

async function uploadFiles(kind: UploadKind, files: File[]) {
  const urls: string[] = []
  for (const file of files) {
    const res =
      kind === 'image'
        ? await userApi.uploadImage(file, 'reference')
        : await userApi.uploadVideo(file, 'reference-video')
    if (res.url) urls.push(res.url)
  }
  return urls
}

export function ReferenceUploader({
  kind,
  label,
  value,
  onChange,
  previews,
}: {
  kind: UploadKind
  label: string
  value: string
  onChange: (value: string) => void
  previews?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urls = splitLines(value)

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const uploaded = await uploadFiles(kind, files)
      if (uploaded.length === 0) throw new Error('上传失败，未返回地址')
      onChange([...splitLines(value), ...uploaded].join('\n'))
      toast.success(`已上传 ${uploaded.length} 个文件`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field
      label={label}
      hint={
        <>
          <input
            ref={inputRef}
            type="file"
            accept={kind === 'image' ? 'image/*' : 'video/*'}
            multiple
            className="hidden"
            onChange={(event) => {
              void handleFiles(event.target.files)
              event.target.value = ''
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <UploadIcon className="size-3.5" />
            {uploading ? '上传中...' : '本地上传'}
          </Button>
        </>
      }
    >
      <Textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={kind === 'image'
          ? 'https://example.com/ref1.png\n每行一条'
          : 'https://example.com/ref.mp4\n每行一条'}
      />
      {previews && kind === 'image' && urls.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {urls.map((url) => (
            <div key={url} className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
              <img src={url} alt="reference" className="h-28 w-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}
    </Field>
  )
}
