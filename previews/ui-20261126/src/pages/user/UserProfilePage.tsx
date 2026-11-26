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

/**
 * Profile (ledger): an account header with the balance as a reading, then each setting as a ruled row.
 * The stamp is the same ink initial the brand lockup uses.
 */
export function UserProfilePage() {
  const { data: profile, loading, error: loadError, reload } = useAsync(
    () => userApi.getProfile(),
    null as UserProfileResponse | null,
  )
  const { data: balanceCredits, loading: balanceLoading } = useAsync(async () => {
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

      <div className='glass divide-y divide-glass-border overflow-hidden'>
        <InviteBinding />
        <PasswordForm />
        <EmailBinding profile={profile} loading={loading} onBound={reload} />
      </div>
    </>
  )
}
