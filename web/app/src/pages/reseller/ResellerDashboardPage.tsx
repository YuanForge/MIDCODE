import { KeySquareIcon, ServerIcon, ShieldCheckIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { resellerApi, type ResellerKey, type ResellerProfile, type ResellerSite } from '@/lib/api/reseller'
import { useAsync } from '@/hooks/use-async'

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

export function ResellerDashboardPage() {
  const { data, loading, error, reload } = useAsync(async () => {
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
  }, { profile: null as ResellerProfile | null, keys: [] as ResellerKey[], sites: [] as ResellerSite[] })

  const profile = data.profile
  const activeKeys = data.keys.filter((key) => key.is_active !== false).length
  const runningSites = data.sites.filter((site) => site.status === 'running').length
  const latestSite = data.sites[0]

  return (
    <>
      <PageHeader
        eyebrow="Reseller"
        title="代理商工作台"
        description="查看账号状态、API Key 和代理站搭建概况。"
        actions={error ? <Button size="sm" variant="outline" onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {profile?.is_active === false ? (
        <Alert>
          <AlertDescription>当前代理商账号已停用，请联系管理员处理后再继续操作。</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="可用 Key"
          value={String(activeKeys)}
          hint={`总 Key 数 ${profile?.key_count ?? data.keys.length}`}
          icon={<KeySquareIcon className="size-4" />}
          loading={loading}
          variant="primary"
        />
        <StatCard
          title="代理站点"
          value={String(profile?.site_count ?? data.sites.length)}
          hint={`运行中 ${runningSites}`}
          icon={<ServerIcon className="size-4" />}
          loading={loading}
          variant="info"
        />
        <StatCard
          title="账号状态"
          value={profile?.is_active === false ? '停用' : '启用'}
          hint={profile?.username ?? '代理商账号'}
          icon={<ShieldCheckIcon className="size-4" />}
          loading={loading}
          variant={profile?.is_active === false ? 'warning' : 'success'}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>代理商资料</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          {[
            ['代理商名称', profile?.name],
            ['登录账号', profile?.username],
            ['邮箱', profile?.email ?? '-'],
            ['创建时间', formatTime(profile?.created_at)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              {loading ? <Skeleton className="mt-2 h-4 w-24" /> : <p className="mt-2 text-sm">{value || '-'}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>最近代理站</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : latestSite ? (
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">站点名称</p>
                <p className="mt-1 font-medium">{latestSite.site_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">状态</p>
                <p className="mt-1 font-medium">{latestSite.status ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Redis DB</p>
                <p className="mt-1 font-mono">{latestSite.redis_db ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">NATS namespace</p>
                <p className="mt-1 truncate font-mono">{latestSite.nats_namespace ?? '-'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">还没有创建代理站。请先创建 API Key，再搭建代理站。</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
