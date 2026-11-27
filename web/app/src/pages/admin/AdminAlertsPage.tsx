import { useState } from 'react'
import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react'

import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminAlert } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 30

/** An alert nobody has looked at yet is the only one that reads as a problem. */
function statusOf(status?: string): { tone: 'success' | 'warning' | 'danger'; label: string } {
  if (status === 'resolved') return { tone: 'success', label: '已解决' }
  if (status === 'acked') return { tone: 'warning', label: '已确认' }
  return { tone: 'danger', label: '未处理' }
}

/** System alerts as a ruled ledger: open ones carry a red edge, and each can be acknowledged and then resolved. */
export function AdminAlertsPage() {
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data, loading, error, reload } = useAsync(async () => {
    const params: Record<string, unknown> = { page, size: PAGE_SIZE }
    if (filterStatus) params.status = filterStatus
    const res = await adminApi.listAlerts(params)
    return { alerts: res.alerts ?? [], total: res.total ?? 0 }
  }, { alerts: [] as AdminAlert[], total: 0 }, [page, filterStatus])

  const [mutError, setMutError] = useState('')

  async function act(run: () => Promise<unknown>) {
    setMutError('')
    try {
      await run()
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  const shownError = error || mutError

  return (
    <>
      <PageHeader title='告警中心' description='系统自动产生的异常告警，需要运维人员处理确认。' />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <FilterBar
        filters={
          <div className='flex flex-col gap-1'>
            <Label htmlFor='alert-status' className='text-xs text-muted-foreground'>状态</Label>
            <Select
              value={filterStatus || '_all'}
              onValueChange={(value) => {
                setFilterStatus(value === '_all' ? '' : value)
                setPage(1)
              }}
            >
              <SelectTrigger id='alert-status' className='w-28'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='_all'>全部</SelectItem>
                <SelectItem value='open'>未处理</SelectItem>
                <SelectItem value='acked'>已确认</SelectItem>
                <SelectItem value='resolved'>已解决</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        actions={
          <Button
            variant='outline'
            onClick={() => {
              setFilterStatus('')
              setPage(1)
            }}
          >
            重置
          </Button>
        }
      />

      <div className='glass overflow-hidden'>
        <Table className='min-w-[900px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>ID</TableHead>
              <TableHead className='w-28'>告警类型</TableHead>
              <TableHead className='w-32'>资源</TableHead>
              <TableHead>消息</TableHead>
              <TableHead className='w-24'>状态</TableHead>
              <TableHead className='w-44'>发生时间</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : (
            <TableBody>
              {data.alerts.length === 0 ? (
                <TableEmpty cols={7} Icon={AlertTriangleIcon} title='暂无告警' description='系统运行正常。' />
              ) : (
                data.alerts.map((item) => {
                  const id = item.id
                  const status = statusOf(item.status)
                  const isOpen = item.status !== 'resolved' && item.status !== 'acked'
                  return (
                    <TableRow key={id} className={cn(isOpen && 'shadow-[inset_2px_0_0_var(--destructive)]')}>
                      <TableCell className='tabular-nums'>{id}</TableCell>
                      <TableCell>
                        <Badge variant='outline'>{item.type}</Badge>
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {item.resource_type} #{item.resource_id}
                      </TableCell>
                      <TableCell className='max-w-sm truncate text-sm' title={item.message}>{item.message}</TableCell>
                      <TableCell>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell className='text-right'>
                        {id != null ? (
                          <div className='flex justify-end gap-2'>
                            {item.status === 'open' ? (
                              <Button size='sm' variant='outline' onClick={() => void act(() => adminApi.ackAlert(id))}>
                                确认
                              </Button>
                            ) : null}
                            {item.status !== 'resolved' ? (
                              <Button size='sm' variant='outline' onClick={() => void act(() => adminApi.resolveAlert(id))}>
                                <CheckCircleIcon data-icon='inline-start' />
                                解决
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })
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
