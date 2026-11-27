import { PageHeader } from '@/components/shared/PageHeader'
import { Readout } from '@/components/shared/Readout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { userApi, type UserProfileResponse } from '@/lib/api/user'
import { copyToClipboard } from '@/lib/clipboard'
import { EmailBinding } from '@/pages/user/profile/EmailBinding'
import { InviteBinding } from '@/pages/user/profile/InviteBinding'
import { PasswordForm } from '@/pages/user/profile/PasswordForm'

import { PageSection } from '@/components/shared/PageSection'
import { QQBindingCard } from './QQBindingCard'
import { CreditTransferCard } from './CreditTransferCard'

const yuan = (credits: number) => (credits / 1_000_000).toLocaleString('zh-CN', { maximumFractionDigits: 6 })

function VIPCard() {
  const { data, loading, error, reload } = useAsync(userApi.getVIPProgress, null)
  return (
    <PageSection title="VIP 会员等级" description="按计入升级的累计充值金额自动升档。">
      {loading ? <Skeleton className="h-20" /> : error ? (
        <Button variant="outline" onClick={reload}>加载失败，重新获取</Button>
      ) : data && (
        <div className="space-y-5 text-sm">
          <div className="space-y-2 rounded-lg bg-muted p-4">
            <div className="flex items-center justify-between"><span>当前等级</span><Badge>{data.current || '普通用户'}</Badge></div>
            <p>已计入升级的充值金额 <strong>{yuan(data.recharge)} 元</strong></p>
            <p>{data.next ? (data.remaining > 0 ? `再充值 ${yuan(data.remaining)} 元可升至 ${data.next.name}` : `已达到 ${data.next.name} 的充值门槛`) : data.levels?.length ? '已达最高等级' : '暂无开放的 VIP 等级'}</p>
          </div>
          {!!data.levels?.length && <table className="w-full text-left">
            <thead className="text-muted-foreground"><tr><th className="pb-2">会员等级</th><th className="pb-2 text-right">累计充值门槛</th></tr></thead>
            <tbody>{data.levels.map(level => <tr key={level.code} className="border-t"><td className="py-2">{level.name}</td><td className="text-right tabular-nums">{yuan(level.threshold)} 元</td></tr>)}</tbody>
          </table>}
        </div>
      )}
    </PageSection>
  )
}

/**
 * Profile (ledger): an account header with the balance as a reading, then each setting as a ruled row.
 * The stamp is the same ink initial the brand lockup uses.
 */
export function UserProfilePage() {
  const { data: profile, loading, error: loadError, reload } = useAsync(
    () => userApi.getProfile(),
    null as UserProfileResponse | null,
  )
  const { data: balanceCredits, loading: balanceLoading, reload: reloadBalance } = useAsync(async () => {
    const res = await userApi.getBalance()
    return res.balance_credits ?? 0
  }, 0)

  const initial = (profile?.username?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()
  const balanceYuan = (balanceCredits / 1e6).toFixed(4)

  return (
    <>
      <PageHeader
        title='个人中心'
        description='账号基本信息与安全设置。'
        actions={loadError ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {loadError ? (
        <Alert variant='destructive'>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label='账户概览'
        className='glass grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center'
      >
        <div className='flex min-w-0 items-center gap-4'>
          <div
            aria-hidden
            className='flex size-14 shrink-0 items-center justify-center rounded-md bg-foreground text-xl font-semibold text-background'
          >
            {loading ? '?' : initial}
          </div>
          <div className='flex min-w-0 flex-col gap-1'>
            {loading ? (
              <>
                <Skeleton className='h-7 w-40' />
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-32' />
              </>
            ) : (
              <>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='truncate text-xl font-semibold tracking-tight'>{profile?.username ?? '-'}</span>
                  {profile?.group ? <Badge variant='secondary'>{profile.group}</Badge> : null}
                </div>
                <button
                  type='button'
                  title='点击复制用户 ID'
                  disabled={!profile?.id}
                  onClick={() => void copyToClipboard(String(profile?.id ?? ''), { successMessage: '用户 ID 已复制' })}
                  className='w-fit rounded-sm text-sm text-muted-foreground tabular-nums outline-none transition-colors duration-140 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none'
                >
                  UID #{profile?.id ?? '-'}
                </button>
                <span className='truncate text-sm text-muted-foreground'>{profile?.email ?? '未绑定邮箱'}</span>
              </>
            )}
          </div>
        </div>
        <Readout label='当前余额' value={`¥${balanceYuan}`} loading={balanceLoading} />
      </section>

      <div className='grid gap-4 lg:grid-cols-2'>
        <div className='grid gap-4'><QQBindingCard /><CreditTransferCard userId={profile?.id} onSuccess={reloadBalance} /></div>
        <VIPCard />
      </div>

      <div className='glass divide-y divide-glass-border overflow-hidden'>
        <InviteBinding />
        <PasswordForm />
        <EmailBinding profile={profile} loading={loading} onBound={reload} />
      </div>
    </>
  )
}
