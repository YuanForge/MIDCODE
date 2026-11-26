import type { ReactNode } from 'react'

import { StatusBadge, Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AdminUser } from '@/lib/api/admin'
import type { ActionMode } from '@/pages/admin/users/actions'
import { UserReferrals } from '@/pages/admin/users/UserReferrals'
import { fmtBalance, fmtTime, isActive, yuan } from '@/pages/admin/users/userFormat'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 break-words text-sm'>{children}</dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-2'>
      <p className='text-xs text-muted-foreground'>{title}</p>
      <div className='flex flex-wrap gap-2'>{children}</div>
    </div>
  )
}

const muted = (text: string) => <span className='text-muted-foreground/60'>{text}</span>

/** One account's facts, then what an admin can do to it, grouped by what it touches. */
export function UserInfoTab({
  user,
  onAction,
  onUnfreeze,
  onRefreshVip,
}: {
  user: AdminUser
  onAction: (mode: ActionMode) => void
  onUnfreeze: () => void
  onRefreshVip: () => void
}) {
  const active = isActive(user)

  return (
    <div className='flex flex-col gap-5 pt-2'>
      <dl className='grid grid-cols-2 gap-x-6 gap-y-4'>
        <Fact label='会员号'>
          <span className='font-mono'>{user.id ?? '-'}</span>
        </Fact>
        <Fact label='用户名'>{user.username ?? '-'}</Fact>
        <Fact label='邮箱'>{user.email ?? '-'}</Fact>
        <Fact label='角色'>
          <Badge variant='secondary' className='text-xs'>
            {user.role ?? '-'}
          </Badge>
        </Fact>
        <Fact label='状态'>
          <StatusBadge tone={active ? 'success' : 'danger'}>{active ? '正常' : '冻结'}</StatusBadge>
          {!active && user.frozen_reason ? <p className='mt-1 text-xs text-muted-foreground'>{user.frozen_reason}</p> : null}
        </Fact>
        <Fact label='VIP 等级'>{user.group || muted('未达标')}</Fact>
        <Fact label='升档累计起点'>{user.vip_recharge_baseline ? yuan(user.vip_recharge_baseline, 2) : muted('¥0.00')}</Fact>
        <Fact label='返佣比例'>{user.rebate_ratio != null ? `${(user.rebate_ratio * 100).toFixed(2)}%` : muted('全局默认')}</Fact>
        <Fact label='余额'>
          <span className='font-mono'>{fmtBalance(user)}</span>
        </Fact>
        <Fact label='历史消费'>
          <span className='font-mono'>{yuan(user.total_spent)}</span>
        </Fact>
        <Fact label='注册时间'>{fmtTime(user.created_at)}</Fact>
      </dl>

      {user.id ? <UserReferrals userId={user.id} fallbackInviteCount={user.invite_count} /> : null}

      <div className='flex flex-col gap-4 border-t border-glass-border pt-4'>
        <Group title='资金'>
          <Button size='sm' variant='outline' onClick={() => onAction('recharge')}>
            充值
          </Button>
          <Button size='sm' variant='outline' onClick={() => onAction('model_credit')}>
            赠积分
          </Button>
        </Group>
        <Group title='VIP 与返佣'>
          <Button size='sm' variant='outline' onClick={() => onAction('group')}>
            设置 VIP
          </Button>
          <Button size='sm' variant='outline' onClick={onRefreshVip}>
            按充值升级
          </Button>
          <Button size='sm' variant='outline' onClick={() => onAction('rebate')}>
            设置返佣
          </Button>
        </Group>
        <Group title='账号'>
          <Button size='sm' variant='outline' onClick={() => onAction('password')}>
            改密
          </Button>
          {active ? (
            <Button size='sm' variant='outline' className='text-destructive' onClick={() => onAction('freeze')}>
              冻结
            </Button>
          ) : (
            <Button size='sm' variant='outline' onClick={onUnfreeze}>
              解冻
            </Button>
          )}
          <Button size='sm' variant='outline' className='text-destructive' onClick={() => onAction('delete')}>
            删除
          </Button>
        </Group>
      </div>
    </div>
  )
}
