import { useRef } from 'react'
import { Button } from './button'

interface ImageUploadProps {
  value?: string
  onChange?: (url: string) => void
  accept?: string
  description?: string
}

export function ImageUpload({ value, onChange, accept = 'image/*', description }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // 这里假设管理员上传，分类用 payment-qr
    const { uploadAuthedImage } = await import('@/lib/api/upload')
    const res = await uploadAuthedImage('admin', file, 'payment-qr')
    if (res.url && onChange) onChange(res.url)
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <img src={value} alt="凭证" className="h-32 w-auto rounded border object-contain" />
      ) : null}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          {value ? '重新上传' : '上传图片'}
        </Button>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
    </div>
  )
}
