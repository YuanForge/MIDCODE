import { ScrollTextIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminAuditLog } from '@/lib/api/admin'

/** Every change to a system setting, with the value before and after. Read-only. */
export function SettingLogsTab() {
  const { data, loading, error } = useAsync(async () => {
    const res = await adminApi.listSettingLogs()
    return (res.logs ?? []) as AdminAuditLog[]
  }, [] as AdminAuditLog[], [])

  return (
    <div className='flex flex-col gap-3'>
      <p className='text-sm text-muted-foreground'>系统设置每次变更都会自动记录，只读不可删除。</p>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='glass overflow-x-auto'>
        <Table className='min-w-[760px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-44'>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead className='w-36'>变更项</TableHead>
              <TableHead>前值</TableHead>
              <TableHead>后值</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={5} />
          ) : (
            <TableBody>
              {data.length === 0 ? (
                <TableEmpty cols={5} Icon={ScrollTextIcon} title='暂无操作日志' description='修改系统设置后，变更会自动记录在这里。' />
              ) : (
                data.map((log, index) => {
                  const detail = log.detail as Record<string, unknown> | undefined
                  const before = (detail?.old_val as string | undefined) ?? log.summary ?? '-'
                  const after = (detail?.new_val as string | undefined) ?? '-'
                  return (
                    <TableRow key={log.id ?? index}>
                      <TableCell className='text-sm text-muted-foreground'>{log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}</TableCell>
                      <TableCell className='text-sm'>{log.admin_email || `#${log.admin_id}`}</TableCell>
                      <TableCell className='font-mono text-xs'>{log.resource_type || log.action}</TableCell>
                      <TableCell className='max-w-xs truncate font-mono text-xs text-muted-foreground' title={log.summary}>
                        {before}
                      </TableCell>
                      <TableCell className='max-w-xs truncate font-mono text-xs' title={log.summary}>
                        {after}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  )
}
