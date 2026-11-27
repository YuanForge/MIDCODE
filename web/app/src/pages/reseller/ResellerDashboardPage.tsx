import type { ReactNode } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Readout } from '@/components/shared/Readout'
import { Section } from '@/components/shared/Section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { resellerApi, type ResellerKey, type ResellerProfile, type ResellerSite } from '@/lib/api/reseller'
import { cn } from '@/lib/utils'

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function Fact({ label, value, loading, mono }: { label: string; value: ReactNode; loading?: boolean; mono?: boolean }) {
  return (
    <div className='flex min-w-0 flex-col gap-1 border-b border-glass-border py-3'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className={cn('truncate text-sm', mono && 'font-mono text-[13px]')}>{loading ? <Skeleton className='h-4 w-24' /> : value}</dd>
    </div>
  )
}

/** Reseller workspace: three readings on one ruled band, then the account and the newest proxy site as lists of facts. */
export function ResellerDashboardPage() {
  const { data, loading, error, reload } = useAsync(
    async () => {
      const [profileResponse, keysResponse, sitesResponse] = await Promise.all([
        resellerApi.getProfile(),
        resellerApi.getKeys(),
        resellerApi.getSites(),
      ])
      return {
        profile: profileResponse as ResellerProfile,
        keys: Array.isArray(keysResponse) ? keysResponse : keysResponse.keys ?? keysResponse.items ?? [],
        sites: Array.isArray(sitesResponse) ? sitesResponse : sitesResponse.sites ?? sitesResponse.items ?? [],
      }
    },
    { profile: null as ResellerProfile | null, keys: [] as ResellerKey[], sites: [] as ResellerSite[] },
  )

  const profile = data.profile
  const activeKeys = data.keys.filter((key) => key.is_active !== false).length
  const runningSites = data.sites.filter((site) => site.status === 'running').length
  const latestSite = data.sites[0]
  const disabled = profile?.is_active === false

  return (
    <>
      <PageHeader
        title='代理商工作台'
        description='查看账号状态、API Key 和代理站搭建概况。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {disabled ? (
        <Alert>
          <AlertDescription>当前代理商账号已停用，请联系管理员处理后再继续操作。</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass grid gap-8 p-6 sm:grid-cols-3'>
        <Readout size='md' label='可用 Key' value={String(activeKeys)} note={`总 Key 数 ${profile?.key_count ?? data.keys.length}`} loading={loading} />
        <Readout size='md' label='代理站点' value={String(profile?.site_count ?? data.sites.length)} note={`运行中 ${runningSites}`} loading={loading} />
        <Readout size='md' label='账号状态' value={disabled ? '停用' : '启用'} note={profile?.username ?? '代理商账号'} loading={loading} />
      </div>

      <Section title='代理商资料' panel>
        <dl className='grid gap-x-8 md:grid-cols-2 xl:grid-cols-4'>
          <Fact label='代理商名称' value={profile?.name || '-'} loading={loading} />
          <Fact label='登录账号' value={profile?.username || '-'} loading={loading} />
          <Fact label='邮箱' value={profile?.email || '-'} loading={loading} />
          <Fact label='创建时间' value={formatTime(profile?.created_at)} loading={loading} />
        </dl>
      </Section>

      <Section title='最近代理站' panel>
        {loading ? (
          <Skeleton className='h-20 w-full' />
        ) : latestSite ? (
          <dl className='grid gap-x-8 md:grid-cols-2 xl:grid-cols-4'>
            <Fact label='站点名称' value={latestSite.site_name} />
            <Fact label='状态' value={latestSite.status ?? '-'} />
            <Fact label='Redis DB' value={latestSite.redis_db ?? '-'} mono />
            <Fact label='NATS namespace' value={latestSite.nats_namespace ?? '-'} mono />
          </dl>
        ) : (
          <p className='text-sm text-muted-foreground'>还没有创建代理站。请先创建 API Key，再搭建代理站。</p>
        )}
      </Section>
    </>
  )
}
