import { Loader2, PencilIcon, RefreshCwIcon, ServerIcon, Trash2Icon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminUpstreamPlatform } from '@/lib/api/admin'
import { cn } from '@/lib/utils'
import { formatAlertThreshold, formatBalance, platformLabel, supportsBalance } from '@/pages/admin/upstream/platformForm'

/** A credential that is missing is struck through, so the difference does not rest on colour alone. */
function Credential({ present, children }: { present: boolean; children: string }) {
  return (
    <Badge variant={present ? 'outline' : 'secondary'} className={cn(!present && 'text-muted-foreground line-through')}>
      {children}
    </Badge>
  )
}

/** Upstream platforms as a ruled ledger. A platform whose low-balance alert has fired carries a red edge. */
export function PlatformsTable({
  platforms,
  loading,
  syncingId,
  onSync,
  onEdit,
  onDelete,
}: {
  platforms: AdminUpstreamPlatform[]
  loading: boolean
  syncingId: number | null
  onSync: (platform: AdminUpstreamPlatform) => void
  onEdit: (platform: AdminUpstreamPlatform) => void
  onDelete: (platform: AdminUpstreamPlatform) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[1320px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-16'>ID</TableHead>
            <TableHead>名称</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>Base URL</TableHead>
            <TableHead className='w-36 text-right'>可用余额</TableHead>
            <TableHead className='w-44'>低余额告警</TableHead>
            <TableHead>余额凭据</TableHead>
            <TableHead className='w-24'>状态</TableHead>
            <TableHead className='w-44'>同步时间</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading && platforms.length === 0 ? (
          <TableSkeleton cols={10} />
        ) : (
          <TableBody>
            {platforms.length === 0 ? (
              <TableEmpty cols={10} Icon={ServerIcon} title='暂无上游平台' description='点击右上角添加。' />
            ) : (
              platforms.map((p) => {
                const syncing = syncingId === p.id
                return (
                  <TableRow key={p.id} className={cn(p.balance_alert_notified && 'shadow-[inset_2px_0_0_var(--destructive)]')}>
                    <TableCell className='tabular-nums'>{p.id}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{p.name}</div>
                      <div className='text-xs text-muted-foreground'>{p.note || '-'}</div>
                    </TableCell>
                    <TableCell className='text-sm'>{platformLabel(p.platform_type)}</TableCell>
                    <TableCell className='max-w-[320px] truncate font-mono text-xs text-muted-foreground' title={p.base_url}>
                      {p.base_url}
                    </TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatBalance(p)}</TableCell>
                    <TableCell>
                      <div className='flex flex-wrap items-center gap-1.5'>
                        <span className='text-sm'>{formatAlertThreshold(p)}</span>
                        {p.balance_alert_notified ? <StatusBadge tone='danger'>已通知</StatusBadge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1.5'>
                        <Credential present={Boolean(p.has_api_key)}>api key</Credential>
                        <Credential present={Boolean(p.has_system_token)}>token</Credential>
                        {p.upstream_user_id ? <Badge variant='outline'>user</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={p.is_active ? 'success' : 'neutral'}>{p.is_active ? '正常' : '停用'}</StatusBadge>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {p.balance_synced_at ? new Date(p.balance_synced_at).toLocaleString('zh-CN') : '未同步'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-2'>
                        {supportsBalance(p.platform_type) ? (
                          <Button size='sm' variant='outline' disabled={syncing} onClick={() => onSync(p)}>
                            {syncing ? <Loader2 className='animate-spin' data-icon='inline-start' /> : <RefreshCwIcon data-icon='inline-start' />}
                            立即同步
                          </Button>
                        ) : null}
                        <Button size='sm' variant='outline' onClick={() => onEdit(p)}>
                          <PencilIcon data-icon='inline-start' />
                          编辑
                        </Button>
                        <Button size='sm' variant='outline' className='text-destructive' onClick={() => onDelete(p)}>
                          <Trash2Icon data-icon='inline-start' />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
