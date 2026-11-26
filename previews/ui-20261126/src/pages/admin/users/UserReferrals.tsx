import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminUserReferrals } from '@/lib/api/admin'
import { fmtReferralName, fmtTime } from '@/pages/admin/users/userFormat'

/** Who invited this user, and who they invited. */
export function UserReferrals({ userId, fallbackInviteCount }: { userId: number; fallbackInviteCount?: number }) {
  const { data: referrals, loading, error } = useAsync(async () => {
    return adminApi.getUserReferrals(userId) as Promise<AdminUserReferrals>
  }, null as AdminUserReferrals | null, [userId])

  const invitees = referrals?.invitees ?? []
  const inviteeCount = referrals?.invitee_count ?? fallbackInviteCount
  const inviterText = referrals?.inviter
    ? fmtReferralName(referrals.inviter)
    : referrals?.inviter_id
      ? `#${referrals.inviter_id}（用户已删除或不可用）`
      : '无'

  return (
    <section className='flex flex-col gap-3 border-t border-glass-border pt-4'>
      <dl className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm'>
        <dt className='text-muted-foreground'>邀请人</dt>
        <dd className='truncate'>{loading ? '加载中…' : inviterText}</dd>
        <dt className='text-muted-foreground'>邀请人数</dt>
        <dd>
          {inviteeCount != null ? `${inviteeCount} 人` : '-'}
          {!loading && inviteeCount != null && inviteeCount > invitees.length ? (
            <span className='ml-1 text-xs text-muted-foreground'>当前展示前 {invitees.length} 人</span>
          ) : null}
        </dd>
      </dl>

      <h3 className='text-xs font-medium text-muted-foreground'>邀请的人</h3>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : loading ? (
        <Skeleton className='h-16 w-full' />
      ) : invitees.length === 0 ? (
        <p className='text-sm text-muted-foreground'>暂无邀请用户</p>
      ) : (
        <div className='max-h-56 overflow-auto rounded-xl border border-glass-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-20'>ID</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead className='w-44'>注册时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitees.map((invitee) => (
                <TableRow key={invitee.id ?? `${invitee.username}-${invitee.email}`}>
                  <TableCell className='font-mono text-xs'>#{invitee.id ?? '-'}</TableCell>
                  <TableCell className='max-w-32 truncate text-sm'>{invitee.username || '-'}</TableCell>
                  <TableCell className='max-w-48 truncate text-sm text-muted-foreground'>{invitee.email || '-'}</TableCell>
                  <TableCell className='text-xs text-muted-foreground'>{fmtTime(invitee.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
