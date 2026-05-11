import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ShieldCheckIcon } from 'lucide-react'
import { adminApi, type AdminAuditLog } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

export function AdminAuditPage() {
  const [filterAction, setFilterAction] = useState('')
  const [filterResource, setFilterResource] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 30

  const { data, loading, error } = useAsync(async () => {
    const params: Record<string, unknown> = { page, size: pageSize }
    if (filterAction) params.action = filterAction
    if (filterResource) params.resource_type = filterResource
    const res = await adminApi.listAuditLogs(params)
    return { logs: res.logs ?? [], total: res.total ?? 0 }
  }, { logs: [] as AdminAuditLog[], total: 0 }, [page, filterAction, filterResource])

  const totalPages = Math.ceil(data.total / pageSize)

  return (
    <>
      <PageHeader
        eyebrow="Audit"
        title="操作审计"
        description="记录所有管理员在后台的关键操作，不可删除。"
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">操作类型</label>
            <Input className="w-36" placeholder="如：create" value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(1) }} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">资源类型</label>
            <Select value={filterResource || '_all'} onValueChange={(v) => { setFilterResource(v === '_all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="user">用户</SelectItem>
                <SelectItem value="channel">渠道</SelectItem>
                <SelectItem value="card">卡密</SelectItem>
                <SelectItem value="coupon">优惠券</SelectItem>
                <SelectItem value="settings">系统设置</SelectItem>
                <SelectItem value="withdrawal">提现</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => { setFilterAction(''); setFilterResource(''); setPage(1) }}>重置</Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead className="w-28">操作</TableHead>
              <TableHead className="w-28">资源类型</TableHead>
              <TableHead className="w-20">资源 ID</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-28">IP</TableHead>
              <TableHead className="w-40">时间</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={8} /> : (
            <TableBody>
              {data.logs.length === 0 ? (
                <TableEmpty cols={8} Icon={ShieldCheckIcon} title="暂无审计日志" description="管理员操作后会自动记录。" />
              ) : data.logs.map((log, i) => (
                <TableRow key={log.id ?? i}>
                  <TableCell>{log.id}</TableCell>
                  <TableCell>
                    <div className="text-sm">{log.admin_email}</div>
                    <div className="text-xs text-muted-foreground">#{log.admin_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{log.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.resource_type}</TableCell>
                  <TableCell>{log.resource_id}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{log.summary}</TableCell>
                  <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}
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
