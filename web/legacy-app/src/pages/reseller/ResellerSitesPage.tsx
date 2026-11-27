import { useState } from 'react'
import { CopyIcon, PlusIcon, RefreshCwIcon, ServerIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { copyToClipboard } from '@/lib/clipboard'
import { getApiErrorMessage } from '@/lib/api/http'
import {
  resellerApi,
  type CreateResellerSitePayload,
  type ResellerBuildJob,
  type ResellerKey,
  type ResellerSite,
} from '@/lib/api/reseller'
import { useAsync } from '@/hooks/use-async'

type SiteForm = {
  apiKeyId: string
  siteName: string
  logoUrl: string
  domain: string
  profitRatio: string
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
}

const initialForm: SiteForm = {
  apiKeyId: '',
  siteName: '',
  logoUrl: '',
  domain: '',
  profitRatio: '1.7',
  smtpHost: '',
  smtpPort: '465',
  smtpUser: '',
  smtpPassword: '',
  smtpFrom: '',
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function statusVariant(status?: string) {
  if (status === 'running' || status === 'success') return 'default'
  if (status === 'failed') return 'destructive'
  return 'secondary'
}

function statusLabel(status?: string) {
  if (status === 'running') return '运行中'
  if (status === 'building') return '搭建中'
  if (status === 'failed') return '失败'
  if (status === 'success') return '成功'
  if (status === 'pending') return '待处理'
  return status || '-'
}

export function ResellerSitesPage() {
  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const [keysResponse, sitesResponse] = await Promise.all([
      resellerApi.getKeys(),
      resellerApi.getSites(),
    ])
    return {
      keys: Array.isArray(keysResponse) ? keysResponse : keysResponse.keys ?? keysResponse.items ?? [],
      sites: Array.isArray(sitesResponse) ? sitesResponse : sitesResponse.sites ?? sitesResponse.items ?? [],
    }
  }, { keys: [] as ResellerKey[], sites: [] as ResellerSite[] })

  const activeKeys = data.keys.filter((key) => key.is_active !== false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SiteForm>(initialForm)
  const [created, setCreated] = useState<{ site?: ResellerSite; job?: ResellerBuildJob } | null>(null)
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressSite, setProgressSite] = useState<ResellerSite | null>(null)
  const [progressJobs, setProgressJobs] = useState<ResellerBuildJob[]>([])
  const [mutError, setMutError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progressLoading, setProgressLoading] = useState(false)
  const error = loadError || mutError

  function updateField<K extends keyof SiteForm>(key: K, value: SiteForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetDialog(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setForm(initialForm)
      setCreated(null)
      setMutError('')
    } else if (!form.apiKeyId && activeKeys[0]?.id) {
      setForm((current) => ({ ...current, apiKeyId: String(activeKeys[0].id) }))
    }
  }

  function buildPayload(): CreateResellerSitePayload | null {
    if (activeKeys.length === 0) {
      setMutError('请先生成可用 API Key，再搭建代理站')
      return null
    }
    if (!form.siteName.trim()) {
      setMutError('请输入代理站名称')
      return null
    }
    if (!form.smtpHost.trim() || !form.smtpUser.trim() || !form.smtpPassword.trim() || !form.smtpFrom.trim()) {
      setMutError('请填写完整 SMTP 配置')
      return null
    }
    const profitRatio = Number.parseFloat(form.profitRatio)
    if (!Number.isFinite(profitRatio) || profitRatio < 1) {
      setMutError('利润倍率不能小于 1')
      return null
    }
    const smtpPort = Number.parseInt(form.smtpPort || '465', 10)
    return {
      api_key_id: Number.parseInt(form.apiKeyId || String(activeKeys[0]?.id ?? 0), 10),
      site_name: form.siteName.trim(),
      logo_url: form.logoUrl.trim(),
      domain: form.domain.trim(),
      profit_ratio: profitRatio,
      smtp_host: form.smtpHost.trim(),
      smtp_port: Number.isFinite(smtpPort) ? smtpPort : 465,
      smtp_user: form.smtpUser.trim(),
      smtp_password: form.smtpPassword,
      smtp_from: form.smtpFrom.trim(),
    }
  }

  async function submit() {
    const payload = buildPayload()
    if (!payload) return
    setSubmitting(true)
    setMutError('')
    try {
      const response = await resellerApi.createSite(payload)
      setCreated(response)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function openProgress(site: ResellerSite) {
    if (!site.id) return
    setProgressSite(site)
    setProgressOpen(true)
    setProgressLoading(true)
    setMutError('')
    try {
      const response = await resellerApi.getBuildProgress(site.id)
      setProgressSite(response.site ?? site)
      setProgressJobs(response.jobs ?? [])
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setProgressLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Reseller"
        title="代理站点"
        description="创建代理站记录并生成独立数据库、Redis DB、NATS namespace 等资源信息。"
        actions={
          <>
            {error ? <Button size="sm" variant="outline" onClick={reload}>重试</Button> : null}
            <Button onClick={() => resetDialog(true)} disabled={activeKeys.length === 0}>
              <PlusIcon data-icon="inline-start" />
              搭建代理站
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {activeKeys.length === 0 && !loading ? (
        <Alert>
          <AlertDescription>需要先生成 API Key，才能创建代理站点。</AlertDescription>
        </Alert>
      ) : null}
      <Card className="overflow-hidden">
        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>站点</TableHead>
              <TableHead>域名</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>DB</TableHead>
              <TableHead>Redis</TableHead>
              <TableHead>端口</TableHead>
              <TableHead>NATS</TableHead>
              <TableHead>代码目录</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={11} />
          ) : (
            <TableBody>
              {data.sites.length === 0 ? (
                <TableEmpty
                  cols={11}
                  Icon={ServerIcon}
                  title="还没有代理站"
                  description="生成 Key 后，可以在这里创建代理站搭建任务。"
                />
              ) : (
                data.sites.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell>{row.id ?? '-'}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.site_name ?? '-'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{row.site_code ?? '-'}</div>
                    </TableCell>
                    <TableCell>{row.domain || row.public_url || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.db_name ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.redis_db ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.app_port ?? '-'}</TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs">{row.nats_namespace ?? '-'}</TableCell>
                    <TableCell className="max-w-[240px] truncate font-mono text-xs text-muted-foreground">{row.code_path ?? '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTime(row.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openProgress(row)}>
                        <RefreshCwIcon data-icon="inline-start" />
                        进度
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={resetDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>搭建代理站</DialogTitle>
            <DialogDescription>创建成功后会生成独立资源信息；如果自动搭建未开启，需要管理员按记录人工配置外层 Nginx 和后续发布。</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>绑定 Key</Label>
              <NativeSelect value={form.apiKeyId} onChange={(event) => updateField('apiKeyId', event.target.value)}>
                {activeKeys.map((key) => (
                  <option key={key.id} value={String(key.id)}>
                    {key.name ?? 'API Key'} #{key.id}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label>代理站名称</Label>
              <Input value={form.siteName} onChange={(event) => updateField('siteName', event.target.value)} placeholder="例如 Midcode" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Logo URL</Label>
              <Input value={form.logoUrl} onChange={(event) => updateField('logoUrl', event.target.value)} placeholder="可留空" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>域名</Label>
              <Input value={form.domain} onChange={(event) => updateField('domain', event.target.value)} placeholder="example.com，可留空" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>默认利润倍率</Label>
              <Input value={form.profitRatio} onChange={(event) => updateField('profitRatio', event.target.value)} placeholder="1.7" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>SMTP 端口</Label>
              <Input value={form.smtpPort} onChange={(event) => updateField('smtpPort', event.target.value)} placeholder="465" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>SMTP Host</Label>
              <Input value={form.smtpHost} onChange={(event) => updateField('smtpHost', event.target.value)} placeholder="smtp.example.com" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>SMTP User</Label>
              <Input value={form.smtpUser} onChange={(event) => updateField('smtpUser', event.target.value)} placeholder="no-reply@example.com" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>SMTP Password</Label>
              <Input type="password" value={form.smtpPassword} onChange={(event) => updateField('smtpPassword', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>SMTP From</Label>
              <Input value={form.smtpFrom} onChange={(event) => updateField('smtpFrom', event.target.value)} placeholder="Site <no-reply@example.com>" />
            </div>
          </div>
          {created ? (
            <Alert>
              <AlertDescription className="space-y-2">
                <span className="block">代理站记录已创建。</span>
                <span className="block font-mono text-xs">DB: {created.site?.db_name ?? '-'}</span>
                <span className="block font-mono text-xs">Redis DB: {created.site?.redis_db ?? '-'}</span>
                <span className="block font-mono text-xs">NATS: {created.site?.nats_namespace ?? '-'}</span>
                <span className="block font-mono text-xs">目录: {created.site?.code_path ?? '-'}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(JSON.stringify(created.site ?? {}, null, 2), { successMessage: '已复制资源信息' })}
                >
                  <CopyIcon data-icon="inline-start" />
                  复制资源信息
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => resetDialog(false)}>关闭</Button>
            <Button onClick={submit} disabled={submitting || Boolean(created)}>
              {submitting ? '创建中...' : '创建代理站'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>搭建进度</DialogTitle>
            <DialogDescription>{progressSite?.site_name ?? '-'}</DialogDescription>
          </DialogHeader>
          {progressLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : (
            <div className="space-y-3">
              {progressJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无构建任务记录。</p>
              ) : (
                progressJobs.map((job) => (
                  <div key={job.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">任务 #{job.id}</span>
                      <Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <span>步骤：{job.step ?? '-'}</span>
                      <span>创建：{formatTime(job.created_at)}</span>
                      <span>开始：{formatTime(job.started_at)}</span>
                      <span>结束：{formatTime(job.finished_at)}</span>
                    </div>
                    {job.error ? <p className="mt-2 text-xs text-destructive">{job.error}</p> : null}
                  </div>
                ))
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgressOpen(false)}>关闭</Button>
            {progressSite?.id ? (
              <Button onClick={() => openProgress(progressSite)} disabled={progressLoading}>
                <RefreshCwIcon data-icon="inline-start" />
                刷新
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
