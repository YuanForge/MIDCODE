import type { ReactNode } from 'react'
import { CopyIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { copyToClipboard } from '@/lib/clipboard'
import type { ResellerKey, ResellerSite } from '@/lib/api/reseller'
import type { SiteForm } from '@/pages/reseller/sites/siteForm'

type FieldKey = Exclude<keyof SiteForm, 'apiKeyId'>
type FieldSpec = { key: FieldKey; label: string; placeholder?: string; type?: string }
type OnField = <K extends keyof SiteForm>(key: K, value: SiteForm[K]) => void

const SITE_FIELDS: FieldSpec[] = [
  { key: 'siteName', label: '代理站名称', placeholder: '例如 Midcode' },
  { key: 'logoUrl', label: 'Logo URL', placeholder: '可留空' },
  { key: 'domain', label: '域名', placeholder: 'example.com，可留空' },
  { key: 'profitRatio', label: '默认利润倍率', placeholder: '1.7' },
]

const SMTP_FIELDS: FieldSpec[] = [
  { key: 'smtpHost', label: 'SMTP Host', placeholder: 'smtp.example.com' },
  { key: 'smtpPort', label: 'SMTP 端口', placeholder: '465' },
  { key: 'smtpUser', label: 'SMTP User', placeholder: 'no-reply@example.com' },
  { key: 'smtpPassword', label: 'SMTP Password', type: 'password' },
  { key: 'smtpFrom', label: 'SMTP From', placeholder: 'Site <no-reply@example.com>' },
]

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-3 border-t border-glass-border pt-4 first:border-t-0 first:pt-0'>
      <p className='text-sm font-medium'>{title}</p>
      <div className='grid gap-4 md:grid-cols-2'>{children}</div>
    </div>
  )
}

function Fields({ specs, form, onField }: { specs: FieldSpec[]; form: SiteForm; onField: OnField }) {
  return (
    <>
      {specs.map((spec) => (
        <div key={spec.key} className='flex flex-col gap-1.5'>
          <Label htmlFor={`site-${spec.key}`}>{spec.label}</Label>
          <Input
            id={`site-${spec.key}`}
            type={spec.type}
            value={form[spec.key]}
            onChange={(event) => onField(spec.key, event.target.value)}
            placeholder={spec.placeholder}
          />
        </div>
      ))}
    </>
  )
}

/** Build a proxy site: the site's own details first, then the mail account it sends from. Errors and the result stay inside the dialog. */
export function CreateSiteDialog({
  open,
  onOpenChange,
  form,
  onField,
  keys,
  created,
  error,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: SiteForm
  onField: OnField
  keys: ResellerKey[]
  created: { site?: ResellerSite } | null
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  const site = created?.site

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>搭建代理站</DialogTitle>
          <DialogDescription>创建成功后会生成独立资源信息；如果自动搭建未开启，需要管理员按记录人工配置外层 Nginx 和后续发布。</DialogDescription>
        </DialogHeader>
        <div className='flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1'>
          <Group title='站点'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='site-apiKeyId'>绑定 Key</Label>
              <NativeSelect id='site-apiKeyId' value={form.apiKeyId} onChange={(event) => onField('apiKeyId', event.target.value)}>
                {keys.map((key) => (
                  <option key={key.id} value={String(key.id)}>
                    {key.name ?? 'API Key'} #{key.id}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Fields specs={SITE_FIELDS} form={form} onField={onField} />
          </Group>
          <Group title='邮件发送'>
            <Fields specs={SMTP_FIELDS} form={form} onField={onField} />
          </Group>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {created ? (
            <Alert>
              <AlertDescription className='flex flex-col gap-2'>
                <span>代理站记录已创建。</span>
                <span className='font-mono text-xs'>DB: {site?.db_name ?? '-'}</span>
                <span className='font-mono text-xs'>Redis DB: {site?.redis_db ?? '-'}</span>
                <span className='font-mono text-xs'>NATS: {site?.nats_namespace ?? '-'}</span>
                <span className='font-mono text-xs'>目录: {site?.code_path ?? '-'}</span>
                <Button
                  size='sm'
                  variant='outline'
                  className='self-start'
                  onClick={() => copyToClipboard(JSON.stringify(site ?? {}, null, 2), { successMessage: '已复制资源信息' })}
                >
                  <CopyIcon data-icon='inline-start' />
                  复制资源信息
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button onClick={onSubmit} disabled={submitting || Boolean(created)}>
            {submitting ? '创建中...' : '创建代理站'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
