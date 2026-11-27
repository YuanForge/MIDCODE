import { useState } from 'react'
import { PlusIcon, RefreshCwIcon, ServerIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { resellerApi, type ResellerBuildJob, type ResellerKey, type ResellerSite } from '@/lib/api/reseller'
import { cn } from '@/lib/utils'
import { CreateSiteDialog } from '@/pages/reseller/sites/CreateSiteDialog'
import { ProgressDialog } from '@/pages/reseller/sites/ProgressDialog'
import { buildSitePayload, initialForm, type SiteForm } from '@/pages/reseller/sites/siteForm'
import { formatTime, statusLabel, statusTone } from '@/pages/reseller/sites/status'

/** Proxy sites as a ruled ledger. Building one and watching its progress are dialogs on top of it. */
export function ResellerSitesPage() {
  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const [keysResponse, sitesResponse] = await Promise.all([resellerApi.getKeys(), resellerApi.getSites()])
    return {
      keys: Array.isArray(keysResponse) ? keysResponse : keysResponse.keys ?? keysResponse.items ?? [],
      sites: Array.isArray(sitesResponse) ? sitesResponse : sitesResponse.sites ?? sitesResponse.items ?? [],
    }
  }, { keys: [] as ResellerKey[], sites: [] as ResellerSite[] })

  const activeKeys = data.keys.filter((key) => key.is_active !== false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SiteForm>(initialForm)
  const [created, setCreated] = useState<{ site?: ResellerSite; job?: ResellerBuildJob } | null>(null)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressSite, setProgressSite] = useState<ResellerSite | null>(null)
  const [progressJobs, setProgressJobs] = useState<ResellerBuildJob[]>([])
  const [progressLoading, setProgressLoading] = useState(false)
  const [progressError, setProgressError] = useState('')

  function updateField<K extends keyof SiteForm>(key: K, value: SiteForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setForm(initialForm)
      setCreated(null)
      setFormError('')
    } else if (!form.apiKeyId && activeKeys[0]?.id) {
      setForm((current) => ({ ...current, apiKeyId: String(activeKeys[0].id) }))
    }
  }

  async function submit() {
    const built = buildSitePayload(form, activeKeys)
    if ('error' in built) {
      setFormError(built.error)
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      setCreated(await resellerApi.createSite(built.payload))
      reload()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function openProgress(site: ResellerSite) {
    if (!site.id) return
    setProgressSite(site)
    setProgressOpen(true)
    setProgressLoading(true)
    setProgressError('')
    try {
      const response = await resellerApi.getBuildProgress(site.id)
      setProgressSite(response.site ?? site)
      setProgressJobs(response.jobs ?? [])
    } catch (err) {
      setProgressError(getApiErrorMessage(err))
    } finally {
      setProgressLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        title='代理站点'
        description='创建代理站记录并生成独立数据库、Redis DB、NATS namespace 等资源信息。'
        actions={
          <>
            {loadError ? <Button variant='outline' onClick={reload}>重试</Button> : null}
            <Button onClick={() => onOpenChange(true)} disabled={activeKeys.length === 0}>
              <PlusIcon data-icon='inline-start' />
              搭建代理站
            </Button>
          </>
        }
      />
      {loadError ? (
        <Alert variant='destructive'>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {activeKeys.length === 0 && !loading ? (
        <Alert>
          <AlertDescription>需要先生成 API Key，才能创建代理站点。</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[1180px]'>
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
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={11} />
          ) : (
            <TableBody>
              {data.sites.length === 0 ? (
                <TableEmpty cols={11} Icon={ServerIcon} title='还没有代理站' description='生成 Key 后，可以在这里创建代理站搭建任务。' />
              ) : (
                data.sites.map((row, index) => (
                  <TableRow key={row.id ?? index} className={cn(row.status === 'failed' && 'shadow-[inset_2px_0_0_var(--destructive)]')}>
                    <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{row.site_name ?? '-'}</div>
                      <div className='font-mono text-xs text-muted-foreground'>{row.site_code ?? '-'}</div>
                    </TableCell>
                    <TableCell>{row.domain || row.public_url || '-'}</TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                    </TableCell>
                    <TableCell className='font-mono text-xs'>{row.db_name ?? '-'}</TableCell>
                    <TableCell className='font-mono text-xs'>{row.redis_db ?? '-'}</TableCell>
                    <TableCell className='font-mono text-xs'>{row.app_port ?? '-'}</TableCell>
                    <TableCell className='max-w-[180px] truncate font-mono text-xs'>{row.nats_namespace ?? '-'}</TableCell>
                    <TableCell className='max-w-[240px] truncate font-mono text-xs text-muted-foreground'>{row.code_path ?? '-'}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                    <TableCell className='text-right'>
                      <Button size='sm' variant='outline' onClick={() => void openProgress(row)}>
                        <RefreshCwIcon data-icon='inline-start' />
                        进度
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <CreateSiteDialog
        open={open}
        onOpenChange={onOpenChange}
        form={form}
        onField={updateField}
        keys={activeKeys}
        created={created}
        error={formError}
        submitting={submitting}
        onSubmit={() => void submit()}
      />
      <ProgressDialog
        open={progressOpen}
        onOpenChange={setProgressOpen}
        site={progressSite}
        jobs={progressJobs}
        loading={progressLoading}
        error={progressError}
        onRefresh={() => progressSite && void openProgress(progressSite)}
      />
    </>
  )
}
