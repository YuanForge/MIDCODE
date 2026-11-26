import { UsersIcon } from 'lucide-react'

import { Section } from '@/components/shared/Section'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { InviteeRecord } from '@/lib/api/user'

export function InviteeTable({ rows, loading }: { rows: InviteeRecord[]; loading: boolean }) {
  return (
    <Section
      title={
        <>
          被邀请用户
          {!loading ? <span className='ml-2 font-normal text-muted-foreground tabular-nums'>{rows.length}</span> : null}
        </>
      }
      description='注册时间、累计充值和累计消费'
    >
      <div className='glass overflow-hidden'>
        <Table className='min-w-[680px]'>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead className='w-36 text-right'>累计充值（¥）</TableHead>
              <TableHead className='w-36 text-right'>累计消费（¥）</TableHead>
              <TableHead className='w-44'>注册时间</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={4} rows={2} />
          ) : (
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty cols={4} Icon={UsersIcon} title='暂无邀请记录' description='把邀请链接分享给朋友，对方注册后会出现在这里。' />
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className='font-medium'>{row.username ?? '-'}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>¥{(row.total_recharge ?? 0).toFixed(2)}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>¥{(row.total_spend ?? 0).toFixed(2)}</TableCell>
                    <TableCell className='text-[13px] text-muted-foreground'>
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>
    </Section>
  )
}
