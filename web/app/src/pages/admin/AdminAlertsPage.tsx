import { useState } from 'react'
import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { adminApi, type AdminAlert } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

function statusBadge(s: string | undefined) {
  if (s === 'resolved') return <Badge className="bg-emerald-600 text-white">已解决</Badge>
  if (s === 'acked') return <Badge className="bg-yellow-600 text-white">已确认</Badge>
  return <Badge variant="destructive">未处理</Badge>
}

export function AdminAlertsPage() {
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 30

  const { data, loading, error, reload } = useAsync(async () => {
    const params: Record<string, unknown> = { page, size: pageSize }
    if (filterStatus) params.status = filterStatus
    const res = await adminApi.listAlerts(params)
    return { alerts: res.alerts ?? [], total: res.total ?? 0 }
  }, { alerts: [] as AdminAlert[], total: 0 }, [page, filterStatus])

  const [mutError, setMutError] = useState('')
  const totalPages = Math.ceil(data.total / pageSize)

  async function handleAck(id: number) {
    setMutError('')
    try {
      await adminApi.ackAlert(id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function handleResolve(id: number) {
    setMutError('')
    try {
      await adminApi.resolveAlert(id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Alerts"
        title="告警中心"
        description="系统自动产生的异常告警，需要运维人员处理确认。"
      />
      {error || mutError ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error ?? mutError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">状态</label>
            <Select value={filterStatus || '_all'} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="open">未处理</SelectItem>
                <SelectItem value="acked">已确认</SelectItem>
                <SelectItem value="resolved">已解决</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => { setFilterStatus(''); setPage(1) }}>重置</Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead className="w-28">告警类型</TableHead>
              <TableHead className="w-28">资源</TableHead>
              <TableHead>消息</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-40">发生时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={7} /> : (
            <TableBody>
              {data.alerts.length === 0 ? (
                <TableEmpty cols={7} Icon={AlertTriangleIcon} title="暂无告警" description="系统运行正常。" />
              ) : data.alerts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.id}</TableCell>
                  <TableCell><Badge variant="outline">{a.type}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.resource_type} #{a.resource_id}
                  </TableCell>
                  <TableCell className="max-w-sm truncate text-sm">{a.message}</TableCell>
                  <TableCell>{statusBadge(a.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.created_at ? new Date(a.created_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.id != null ? (
                      <div className="flex justify-end gap-2">
                        {a.status === 'open' ? (
                          <Button size="sm" variant="outline" onClick={() => handleAck(a.id!)}>
                            确认
                          </Button>
                        ) : null}
                        {a.status !== 'resolved' ? (
                          <Button size="sm" variant="outline" onClick={() => handleResolve(a.id!)}>
                            <CheckCircleIcon className="mr-1 size-3.5" />解决
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        {totalPages > 1 ? (
          <CardContent className="flex items-center justify-between border-t py-3">
            <span className="text-sm text-muted-foreground">共 {data.total} 条</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
            </div>
          </CardContent>
        ) : null}
      </Card>
    </>
  )
}
