import { useState } from 'react'
import { BellIcon, CheckIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { adminApi, type AdminNotification } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

function statusBadge(s: string | undefined) {
  if (s === 'sent') return <Badge className="bg-emerald-600 text-white">已发送</Badge>
  if (s === 'sending') return <Badge className="bg-blue-600 text-white">发送中</Badge>
  if (s === 'failed') return <Badge variant="destructive">失败</Badge>
  return <Badge variant="outline">草稿</Badge>
}

export function AdminNotificationsPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listNotifications({ size: 50 })
    return res.notifications ?? []
  }, [] as AdminNotification[], [])

  const [mutError, setMutError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', target_type: 'all', target_value: '' })

  async function handleCreate() {
    setMutError('')
    try {
      await adminApi.createNotification({ ...form })
      setCreateOpen(false)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function handleSend(id: number) {
    setMutError('')
    try {
      await adminApi.sendNotification(id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function handleDelete(id: number) {
    setMutError('')
    try {
      await adminApi.deleteNotification(id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title="通知中心"
        description="向用户推送站内通知，支持全量或定向发送。"
        actions={
          <Button size="sm" onClick={() => { setCreateOpen(true); setMutError('') }}>
            <PlusIcon className="mr-1 size-3.5" />新建通知
          </Button>
        }
      />
      {error || mutError ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error ?? mutError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>标题</TableHead>
              <TableHead className="w-24">发送目标</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-40">创建时间</TableHead>
              <TableHead className="w-40">发送时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={7} /> : (
            <TableBody>
              {data.length === 0 ? (
                <TableEmpty cols={7} Icon={BellIcon} title="暂无通知" description="新建通知后会显示在这里。" />
              ) : data.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>{n.id}</TableCell>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{n.target_type === 'all' ? '全部用户' : n.target_value || n.target_type}</Badge>
                  </TableCell>
                  <TableCell>{statusBadge(n.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {n.created_at ? new Date(n.created_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {n.sent_at ? new Date(n.sent_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {n.status === 'draft' && n.id != null ? (
                        <Button size="sm" variant="outline" onClick={() => handleSend(n.id!)}>
                          <CheckIcon className="mr-1 size-3.5" />发送
                        </Button>
                      ) : null}
                      {n.id != null ? (
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(n.id!)}>
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建通知</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>标题</Label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>内容</Label>
              <Textarea rows={4} value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>发送目标</Label>
              <Select value={form.target_type} onValueChange={(v) => setForm(f => ({ ...f, target_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部用户</SelectItem>
                  <SelectItem value="user">指定用户</SelectItem>
                  <SelectItem value="group">指定用户组</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.target_type !== 'all' ? (
              <div className="space-y-1.5">
                <Label>{form.target_type === 'user' ? '用户 ID' : '用户组'}</Label>
                <Input value={form.target_value} onChange={(e) => setForm(f => ({ ...f, target_value: e.target.value }))} />
              </div>
            ) : null}
            {mutError ? <p className="text-sm text-destructive">{mutError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate}>创建草稿</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
