import { useRef } from 'react'
import { QrCodeIcon, UploadIcon } from 'lucide-react'

import { Section } from '@/components/shared/Section'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { QrKind } from '@/pages/user/invite/useQrEditor'

function QrField({
  kind,
  label,
  value,
  onChange,
  onUpload,
}: {
  kind: QrKind
  label: string
  value: string
  onChange: (next: string) => void
  onUpload: (file: File | undefined) => void
}) {
  const uploadRef = useRef<HTMLInputElement>(null)
  return (
    <div className='flex gap-4'>
      <div className='flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-glass-border bg-glass-strong/50'>
        {value ? (
          <img src={value} alt={`${label}预览`} className='size-full animate-reveal bg-white object-contain p-1.5' />
        ) : (
          <QrCodeIcon aria-hidden className='size-6 text-muted-foreground/50' />
        )}
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <div className='flex items-center justify-between gap-2'>
          <Label htmlFor={`invite-qr-${kind}`}>{label}</Label>
          <div className='flex items-center gap-1'>
            <input
              ref={uploadRef}
              type='file'
              accept='image/*'
              className='hidden'
              onChange={(event) => {
                onUpload(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <Button size='sm' variant='ghost' onClick={() => uploadRef.current?.click()}>
              <UploadIcon data-icon='inline-start' />
              本地上传
            </Button>
            {value ? (
              <Button size='sm' variant='ghost' className='text-muted-foreground' onClick={() => onChange('')}>
                清空
              </Button>
            ) : null}
          </div>
        </div>
        <Textarea
          id={`invite-qr-${kind}`}
          rows={2}
          className='min-h-0 text-[13px]'
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`${label} URL`}
        />
      </div>
    </div>
  )
}

/** Payment QR codes, one per method, saved together. A withdrawal needs the code of the chosen method. */
export function QrSection({
  wechat,
  alipay,
  onChange,
  onUpload,
  onSave,
}: {
  wechat: string
  alipay: string
  onChange: (kind: QrKind, next: string) => void
  onUpload: (kind: QrKind, file: File | undefined) => void
  onSave: () => void
}) {
  return (
    <Section
      title='收款码'
      panel
      description='提现前请上传并保存对应支付方式的收款二维码。'
      actions={<Button onClick={onSave}>保存收款码</Button>}
    >
      <div className='grid gap-8 md:grid-cols-2'>
        <QrField kind='wechat' label='微信收款码' value={wechat} onChange={(next) => onChange('wechat', next)} onUpload={(file) => onUpload('wechat', file)} />
        <QrField kind='alipay' label='支付宝收款码' value={alipay} onChange={(next) => onChange('alipay', next)} onUpload={(file) => onUpload('alipay', file)} />
      </div>
    </Section>
  )
}
