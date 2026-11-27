import type { ReactNode } from 'react'
import { KeyRoundIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Readout } from '@/components/shared/Readout'
import { Section } from '@/components/shared/Section'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { vendorApi, type VendorKey, type VendorProfile } from '@/lib/api/vendor'
import { formatCredits } from '@/lib/formatters/credits'

function Fact({ label, value, loading }: { label: string; value: ReactNode; loading: boolean }) {
  return (
    <div className='flex min-w-0 flex-col gap-1 border-b border-glass-border py-3'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='truncate text-sm'>{loading ? <Skeleton className='h-4 w-24' /> : value}</dd>
    </div>
  )
}

/** Vendor workspace: three readings on one ruled band, the account as a list of facts, then the ledger of keys. */
export function VendorDashboardPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [profileResponse, keysResponse] = await Promise.all([vendorApi.getProfile(), vendorApi.getKeys()])
    return {
      profile: profileResponse as VendorProfile,
      keys: Array.isArray(keysResponse) ? keysResponse : keysResponse.items ?? keysResponse.keys ?? [] as VendorKey[],
    }
  }, { profile: null as VendorProfile | null, keys: [] as VendorKey[] })

  const profile = data.profile
  const keys = data.keys
  const keyCount = profile?.key_count ?? keys.length
  const commissionRatio = profile?.commission_ratio ?? 0
  const payoutRatio = Math.max(0, 1 - commissionRatio)

  return (
    <>
      <PageHeader
        title='Vendor 工作台'
        description='供应侧资料与名下 Key 概览。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {profile?.is_active === false ? (
        <Alert>
          <AlertDescription>账号已被禁用，请联系管理员处理后再继续提交或查看号池数据。</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass grid gap-8 p-6 sm:grid-cols-3'>
        <Readout size='md' label='账户余额' value={formatCredits(profile?.balance ?? 0)} note='可提现余额' loading={loading} />
        <Readout size='md' label='提供 Key 数量' value={String(keyCount)} loading={loading} />
        <Readout
          size='md'
          label='手续费比例'
          value={`${(commissionRatio * 100).toFixed(2)}%`}
          note={`平台扣除后，实际到账约 ${(payoutRatio * 100).toFixed(2)}%`}
          loading={loading}
        />
      </div>

      <Section title='供应侧资料' panel>
        <dl className='grid gap-x-8 md:grid-cols-2 xl:grid-cols-4'>
          <Fact label='用户名' value={profile?.username ?? profile?.name ?? '-'} loading={loading} />
          <Fact label='邮箱' value={profile?.email ?? '-'} loading={loading} />
          <Fact label='余额' value={formatCredits(profile?.balance ?? 0)} loading={loading} />
          <Fact
            label='佣金比例'
            value={profile?.commission_ratio != null ? `${(profile.commission_ratio * 100).toFixed(2)}%` : '—（全局）'}
            loading={loading}
          />
        </dl>
      </Section>

      <Section title='名下 Key'>
        <div className='glass overflow-hidden'>
          <Table className='min-w-[760px]'>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>渠道</TableHead>
                <TableHead className='text-right'>总成本</TableHead>
                <TableHead className='text-right'>总收益</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton cols={7} rows={3} />
            ) : (
              <TableBody>
                {keys.length === 0 ? (
                  <TableEmpty cols={7} Icon={KeyRoundIcon} title='暂无 Key 数据' description='上传 Key 后，成本与收益会显示在这里。' />
                ) : (
                  keys.map((key, index) => (
                    <TableRow key={key.id ?? index}>
                      <TableCell className='tabular-nums'>{key.id ?? '-'}</TableCell>
                      <TableCell className='font-mono text-xs text-muted-foreground'>{key.masked_value ?? '-'}</TableCell>
                      <TableCell>{key.channel_name ?? '-'}</TableCell>
                      <TableCell className='text-right font-mono text-[13px]'>{formatCredits(key.total_cost ?? 0)}</TableCell>
                      <TableCell className='text-right font-mono text-[13px]'>{formatCredits(key.my_earn ?? 0)}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {key.created_at ? new Date(key.created_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={key.is_active === false ? 'neutral' : 'success'}>{key.is_active === false ? '停用' : '启用'}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            )}
          </Table>
        </div>
      </Section>
    </>
  )
}
