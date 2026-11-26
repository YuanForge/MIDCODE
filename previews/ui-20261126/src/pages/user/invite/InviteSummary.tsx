import { InfoIcon } from 'lucide-react'

import { CopyButton } from '@/components/shared/CopyButton'
import { Readout } from '@/components/shared/Readout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { InviteInfo } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'

/**
 * Invite overview (ledger): the code and link on the left, the two readings on the right, and the two
 * things that can be done with frozen commission underneath.
 */
export function InviteSummary({
  info,
  loading,
  inviteLink,
  onConvert,
  onWithdraw,
}: {
  info: InviteInfo
  loading: boolean
  inviteLink: string
  onConvert: () => void
  onWithdraw: () => void
}) {
  return (
    <section aria-label='邀请概览' className='glass flex flex-col gap-6 p-5 sm:p-6'>
      <div className='grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16'>
        <div className='flex min-w-0 flex-col gap-3'>
          <span className='text-[13px] text-muted-foreground'>我的邀请码</span>
          <div className='flex items-center gap-1'>
            {loading ? (
              <Skeleton className='h-9 w-36' />
            ) : (
              <span className='font-mono text-3xl font-semibold tracking-wider text-foreground'>{info.invite_code ?? '-'}</span>
            )}
            <CopyButton value={info.invite_code ?? ''} label='复制邀请码' successMessage='邀请码已复制' disabled={loading} />
          </div>
          <div className='flex min-w-0 items-center gap-1 rounded-xl border border-glass-border bg-glass-strong/50 py-1 pr-1 pl-3'>
            <span className='min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'>
              {loading ? '邀请链接加载中…' : inviteLink || '暂无邀请链接'}
            </span>
            <CopyButton value={inviteLink} label='复制链接' showLabel size='sm' successMessage='邀请链接已复制' disabled={loading} />
          </div>
        </div>
        <div className='grid grid-cols-2 gap-6'>
          <Readout size='md' label='已邀请人数' value={info.invite_count ?? 0} note='通过你的邀请码注册的用户' loading={loading} />
          <Readout size='md' label='冻结返佣' value={formatCredits(info.frozen_balance ?? 0)} unit='积分' loading={loading} />
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Button disabled={loading} onClick={onConvert}>
          解冻返佣
        </Button>
        <Button variant='outline' disabled={loading} onClick={onWithdraw}>
          申请提现
        </Button>
      </div>
      <p className='flex max-w-3xl items-start gap-2 text-[13px] leading-5 text-muted-foreground'>
        <InfoIcon aria-hidden className='mt-0.5 size-4 shrink-0' />
        您邀请的用户每次消费后，返佣积分会先冻结到邀请账户；您可以解冻为可用积分，也可以在保存收款码后发起提现申请。
      </p>
    </section>
  )
}
