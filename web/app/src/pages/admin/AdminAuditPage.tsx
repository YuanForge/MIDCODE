import { useState } from 'react'
import { ShieldCheckIcon } from 'lucide-react'

import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminAuditLog } from '@/lib/api/admin'

const PAGE_SIZE = 30

const RESOURCES = [
  { value: 'user', label: '用户' },
  { value: 'channel', label: '渠道' },
  { value: 'card', label: '卡密' },
  { value: 'coupon', label: '优惠券' },
  { value: 'settings', label: '系统设置' },
  { value: 'withdrawal', label: '提现' },
]

/** Append-only record of what admins did, narrowed by action and resource. */
export function AdminAuditPage() {
  const [filterAction, setFilterAction] = useState('')
  const [filterResource, setFilterResource] = useState('')
  const [page, setPage] = useState(1)

  const { data, loading, error } = useAsync(async () => {
    const params: Record<string, unknown> = { page, size: PAGE_SIZE }
    if (filterAction) params.action = filterAction
    if (filterResource) params.resource_type = filterResource
    const res = await adminApi.listAuditLogs(params)
    return { logs: res.logs ?? [], total: res.total ?? 0 }
  }, { logs: [] as AdminAuditLog[], total: 0 }, [page, filterAction, filterResource])

  function changeAction(value: string) {
    setFilterAction(value)
    setPage(1)
  }

  function changeResource(value: string) {
    setFilterResource(value === '_all' ? '' : value)
    setPage(1)
  }

  function reset() {
    setFilterAction('')
    setFilterResource('')
    setPage(1)
  }

  return (
    <>
      <PageHeader title='操作审计' description='记录所有管理员在后台的关键操作，不可删除。' />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FilterBar
        filters={
          <>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='audit-action' className='text-xs text-muted-foreground'>操作类型</Label>
              <Input id='audit-action' className='w-36' placeholder='如：create' value={filterAction} onChange={(event) => changeAction(event.target.value)} />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='audit-resource' className='text-xs text-muted-foreground'>资源类型</Label>
              <Select value={filterResource || '_all'} onValueChange={changeResource}>
                <SelectTrigger id='audit-resource' className='w-36'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='_all'>全部</SelectItem>
                  {RESOURCES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
        actions={<Button variant='outline' onClick={reset}>重置</Button>}
      />

      <div className='glass overflow-hidden'>
        <Table className='min-w-[1040px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>ID</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead className='w-28'>操作</TableHead>
              <TableHead className='w-28'>资源类型</TableHead>
              <TableHead className='w-20'>资源 ID</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className='w-28'>IP</TableHead>
              <TableHead className='w-44'>时间</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={8} />
          ) : (
            <TableBody>
              {data.logs.length === 0 ? (
                <TableEmpty cols={8} Icon={ShieldCheckIcon} title='暂无审计日志' description='管理员操作后会自动记录。' />
              ) : (
                data.logs.map((log, index) => (
                  <TableRow key={log.id ?? index}>
                    <TableCell className='tabular-nums'>{log.id}</TableCell>
                    <TableCell>
                      <div className='text-sm'>{log.admin_email}</div>
                      <div className='text-xs text-muted-foreground'>#{log.admin_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline' className='text-xs'>{log.action}</Badge>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{log.resource_type}</TableCell>
                    <TableCell className='tabular-nums'>{log.resource_id}</TableCell>
                    <TableCell className='max-w-xs truncate text-sm' title={log.summary}>{log.summary}</TableCell>
                    <TableCell className='font-mono text-xs'>{log.ip}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
        {data.total > 0 ? (
          <TablePagination current={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} className='rounded-none border-x-0 border-b-0' />
        ) : null}
      </div>
    </>
  )
}
