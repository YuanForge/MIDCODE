import { useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Readout } from '@/components/shared/Readout'
import { Section } from '@/components/shared/Section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminReseller, type AdminResellerBuildJob, type AdminResellerSite } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { CreateResellerDialog } from '@/pages/admin/resellers/CreateResellerDialog'
import { ResellersTable } from '@/pages/admin/resellers/ResellersTable'
import { buildResellerPayload, initialForm, type ResellerForm } from '@/pages/admin/resellers/resellerForm'
import { JobsTable, SitesTable } from '@/pages/admin/resellers/SiteTables'

/** Reseller accounts, their proxy sites and the build jobs behind them: three readings, then three ruled ledgers. */
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

  const [mutError, setMutError] = useState('')

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ResellerForm>(initialForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function updateField<K extends keyof ResellerForm>(key: K, value: ResellerForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setForm(initialForm)
      setFormError('')
    }
  }

  async function submitCreate() {
    const built = buildResellerPayload(form)
    if ('error' in built) {
      setFormError(built.error)
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await adminApi.createReseller(built.payload)
      onOpenChange(false)
      reload()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
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

  const error = loadError || mutError
  const runningSites = data.sites.filter((site) => site.status === 'running').length

  return (
    <>
      <PageHeader
        title='代理商管理'
        description='由管理员创建代理商账号，并查看代理站资源、构建状态和失败原因。'
        actions={
          <>
            {error ? (
              <Button variant='outline' onClick={reload}>
                重试
              </Button>
            ) : null}
            <Button onClick={() => onOpenChange(true)}>
              <PlusIcon data-icon='inline-start' />
              新建代理商
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass grid gap-8 p-6 sm:grid-cols-3'>
        <Readout size='md' label='代理商' value={String(data.resellers.length)} loading={loading} />
        <Readout size='md' label='代理站' value={String(data.sites.length)} loading={loading} />
        <Readout size='md' label='运行中站点' value={String(runningSites)} loading={loading} />
      </div>

      <Section title='代理商账号'>
        <ResellersTable rows={data.resellers} loading={loading} onToggle={(row) => void toggleReseller(row)} />
      </Section>
      <Section title='代理站资源'>
        <SitesTable rows={data.sites} loading={loading} />
      </Section>
      <Section title='搭建任务'>
        <JobsTable rows={data.jobs} loading={loading} onRetry={(job) => void retryJob(job)} />
      </Section>

      <CreateResellerDialog
        open={open}
        onOpenChange={onOpenChange}
        form={form}
        onField={updateField}
        error={formError}
        submitting={submitting}
        onSubmit={() => void submitCreate()}
      />
    </>
  )
}
