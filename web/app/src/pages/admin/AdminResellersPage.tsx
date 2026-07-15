import { useState } from 'react'
import { BriefcaseBusinessIcon, KeySquareIcon, PlusIcon, RefreshCwIcon, ServerIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { getApiErrorMessage } from '@/lib/api/http'
import {
  adminApi,
  type AdminReseller,
  type AdminResellerBuildJob,
  type AdminResellerSite,
} from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

type ResellerForm = {
  username: string
  email: string
  password: string
  name: string
  contactName: string
  phone: string
  notes: string
}

const initialForm: ResellerForm = {
  username: '',
  email: '',
  password: '',
  name: '',
  contactName: '',
  phone: '',
  notes: '',
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function statusVariant(status?: string): 'default' | 'secondary' | 'destructive' {
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
  if (status === 'manual_ops_required') return '待人工处理'
  return status || '-'
}

export function AdminResellersPage() {
  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const [resellersResponse, sitesResponse, jobsResponse] = await Promise.all([
      adminApi.listResellers(),
      adminApi.listResellerSites(),
      adminApi.listResellerSiteBuildJobs(),
    ])
    return {
      resellers: Array.isArray(resellersResponse) ? resellersResponse : resellersResponse.resellers ?? resellersResponse.items ?? [],
      sites: Array.isArray(sitesResponse) ? sitesResponse : sitesResponse.sites ?? sitesResponse.items ?? [],
      jobs: Array.isArray(jobsResponse) ? jobsResponse : jobsResponse.jobs ?? jobsResponse.items ?? [],
    }
  }, { resellers: [] as AdminReseller[], sites: [] as AdminResellerSite[], jobs: [] as AdminResellerBuildJob[] })

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ResellerForm>(initialForm)
  const [mutError, setMutError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const error = loadError || mutError

  function updateField<K extends keyof ResellerForm>(key: K, value: ResellerForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetDialog(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setForm(initialForm)
      setMutError('')
    }
  }

  async function submitCreate() {
    if (!form.username.trim() || !form.password.trim() || !form.name.trim()) {
      setMutError('请填写用户名、密码和代理商名称')
      return
    }
    setSubmitting(true)
    setMutError('')
    try {
      await adminApi.createReseller({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        contact_name: form.contactName.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      })
      resetDialog(false)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleReseller(row: AdminReseller) {
    if (!row.id) return
    setMutError('')
    try {
      await adminApi.updateReseller(row.id, { is_active: !(row.is_active ?? true) })
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  async function retryJob(job: AdminResellerBuildJob) {
    if (!job.id) return
    setMutError('')
    try {
      await adminApi.retryResellerBuildJob(job.id)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Reseller"
        title="代理商管理"
        description="由管理员创建代理商账号，并查看代理站资源、构建状态和失败原因。"
        actions={
          <>
            {error ? <Button size="sm" variant="outline" onClick={reload}>重试</Button> : null}
            <Button onClick={() => setOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              新建代理商
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <BriefcaseBusinessIcon className="size-4" />
              代理商
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.resellers.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <ServerIcon className="size-4" />
              代理站
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.sites.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeySquareIcon className="size-4" />
              运行中站点
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data.sites.filter((site) => site.status === 'running').length}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>代理商</TableHead>
              <TableHead>联系人</TableHead>
              <TableHead className="text-right">Key</TableHead>
              <TableHead className="text-right">站点</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={8} />
          ) : (
            <TableBody>
              {data.resellers.length === 0 ? (
                <TableEmpty cols={8} Icon={BriefcaseBusinessIcon} title="还没有代理商" />
              ) : (
                data.resellers.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell>{row.id ?? '-'}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.name ?? '-'}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.username ?? '-'} / {row.email ?? '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{row.contact_name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{row.phone || '-'}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.key_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.site_count ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={row.is_active === false ? 'secondary' : 'default'}>
                        {row.is_active === false ? '停用' : '启用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTime(row.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => toggleReseller(row)}>
                        {row.is_active === false ? '启用' : '停用'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>代理站资源</CardTitle>
        </CardHeader>
        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>代理商</TableHead>
              <TableHead>站点</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>DB</TableHead>
              <TableHead>Redis</TableHead>
              <TableHead className="text-right">端口</TableHead>
              <TableHead>NATS</TableHead>
              <TableHead>目录</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={10} />
          ) : (
            <TableBody>
              {data.sites.length === 0 ? (
                <TableEmpty cols={10} Icon={ServerIcon} title="还没有代理站" />
              ) : (
                data.sites.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell>{row.id ?? '-'}</TableCell>
                    <TableCell>{row.reseller_id ?? '-'}</TableCell>
                    <TableCell>
                      <div>{row.site_name ?? '-'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{row.site_code ?? '-'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.db_name ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.redis_db ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{row.app_port ?? '-'}</TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs">{row.nats_namespace ?? '-'}</TableCell>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">{row.code_path ?? '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTime(row.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>搭建任务</CardTitle>
        </CardHeader>
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>站点</TableHead>
              <TableHead>代理商</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>步骤</TableHead>
              <TableHead>错误</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={8} />
          ) : (
            <TableBody>
              {data.jobs.length === 0 ? (
                <TableEmpty cols={8} Icon={RefreshCwIcon} title="还没有搭建任务" />
              ) : (
                data.jobs.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell>{row.id ?? '-'}</TableCell>
                    <TableCell>{row.site_id ?? '-'}</TableCell>
                    <TableCell>{row.reseller_id ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell>{statusLabel(row.step)}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-destructive">{row.error || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTime(row.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryJob(row)}
                        disabled={row.status !== 'failed'}
                      >
                        <RefreshCwIcon data-icon="inline-start" />
                        重试
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建代理商</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>用户名</Label>
              <Input value={form.username} onChange={(event) => updateField('username', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>邮箱</Label>
              <Input value={form.email} onChange={(event) => updateField('email', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>密码</Label>
              <Input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>代理商名称</Label>
              <Input value={form.name} onChange={(event) => updateField('name', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>联系人</Label>
              <Input value={form.contactName} onChange={(event) => updateField('contactName', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>联系电话</Label>
              <Input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label>备注</Label>
              <Textarea value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => resetDialog(false)}>取消</Button>
            <Button onClick={submitCreate} disabled={submitting}>
              {submitting ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
