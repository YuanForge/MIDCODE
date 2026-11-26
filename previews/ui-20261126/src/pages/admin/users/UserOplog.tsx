import { ScrollTextIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminAuditLog } from '@/lib/api/admin'
import { fmtTime } from '@/pages/admin/users/userFormat'

/** What admins have done to this account, newest as the server returns them. */
export function UserOplog({ userId }: { userId: number }) {
  const { data: logs, loading, error } = useAsync(async () => {
    const res = await adminApi.getUserOperationLog(userId)
    return (res.audits ?? []) as AdminAuditLog[]
  }, [] as AdminAuditLog[], [userId])

  return (
    <div className='flex flex-col gap-3 pt-2'>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='overflow-hidden rounded-xl border border-glass-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-44'>时间</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>摘要</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={3} rows={3} />
          ) : (
            <TableBody>
              {logs.length === 0 ? (
                <TableEmpty cols={3} Icon={ScrollTextIcon} title='暂无操作日志' />
              ) : (
                logs.map((log, index) => (
                  <TableRow key={log.id ?? index}>
                    <TableCell className='text-sm text-muted-foreground'>{fmtTime(log.created_at)}</TableCell>
                    <TableCell className='text-sm'>{log.action}</TableCell>
                    <TableCell className='max-w-xs truncate text-xs text-muted-foreground' title={log.summary}>
                      {log.summary ?? '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  )
}
