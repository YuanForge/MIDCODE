import { useState } from 'react'
import { DownloadIcon, PlusIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { adminApi, type AdminExportTask } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

function statusBadge(s: string | undefined) {
  if (s === 'done') return <Badge className="bg-emerald-600 text-white">完成</Badge>
  if (s === 'running') return <Badge className="bg-blue-600 text-white">处理中</Badge>
  if (s === 'failed') return <Badge variant="destructive">失败</Badge>
  return <Badge variant="outline">排队中</Badge>
}

export function AdminExportsPage() {
  const { data: tasks, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listExportTasks()
    return res.tasks ?? []
  }, [] as AdminExportTask[], [])

  const [mutError, setMutError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'transactions' })

  async function handleCreate() {
    setMutError('')
    try {
      await adminApi.createExportTask({ name: form.name, type: form.type, params: {} })
      setCreateOpen(false)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  const fileSize = (bytes?: number) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      <PageHeader
        eyebrow="Exports"
        title="数据导出"
        description="提交异步导出任务，处理完成后可下载文件。"
        actions={
          <Button size="sm" onClick={() => { setCreateOpen(true); setMutError('') }}>
            <PlusIcon className="mr-1 size-3.5" />新建导出
          </Button>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="w-28">类型</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-24 text-right">进度</TableHead>
              <TableHead className="w-24 text-right">文件大小</TableHead>
              <TableHead className="w-40">创建时间</TableHead>
              <TableHead className="w-40">过期时间</TableHead>
              <TableHead className="text-right">下载</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={9} /> : (
            <TableBody>
              {tasks.length === 0 ? (
                <TableEmpty cols={9} Icon={DownloadIcon} title="暂无导出任务" description="点击「新建导出」创建任务。" />
              ) : tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>{task.id}</TableCell>
                  <TableCell className="font-medium">{task.name}</TableCell>
                  <TableCell><Badge variant="outline">{task.type}</Badge></TableCell>
                  <TableCell>{statusBadge(task.status)}</TableCell>
                  <TableCell className="text-right">
                    {task.status === 'running' ? `${task.progress ?? 0}%` : '-'}
                  </TableCell>
                  <TableCell className="text-right">{fileSize(task.file_size)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {task.created_at ? new Date(task.created_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {task.expires_at ? new Date(task.expires_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {task.status === 'done' && task.file_url ? (
                      <a href={task.file_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline">
                          <DownloadIcon className="mr-1 size-3.5" />下载
                        </Button>
                      </a>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        <CardContent className="border-t py-3">
          <Button size="sm" variant="outline" onClick={reload}>刷新状态</Button>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建导出任务</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>任务名称</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：5月账单导出" />
            </div>
            <div className="space-y-1.5">
              <Label>导出类型</Label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactions">账单流水</SelectItem>
                  <SelectItem value="users">用户列表</SelectItem>
                  <SelectItem value="llm_logs">调用日志</SelectItem>
                  <SelectItem value="payments">充值订单</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mutError ? <p className="text-sm text-destructive">{mutError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
