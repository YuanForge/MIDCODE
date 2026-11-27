import { useState } from 'react'
import { BellIcon, CheckIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminNotification } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { cn } from '@/lib/utils'
import { CreateNotificationDialog } from '@/pages/admin/notifications/CreateNotificationDialog'
import {
  initialNotificationForm,
  statusLabel,
  statusTone,
  targetLabel,
  type NotificationForm,
} from '@/pages/admin/notifications/notificationForm'

/** Notifications as a ruled ledger: draft, send, delete. A failed send carries a red edge. */
export function AdminNotificationsPage() {
  const { data: items, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listNotifications({ size: 50 })
    return res.notifications ?? []
  }, [] as AdminNotification[], [])

  const [mutError, setMutError] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<NotificationForm>(initialNotificationForm)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  function updateField<K extends keyof NotificationForm>(key: K, value: NotificationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function create() {
    setCreating(true)
    setCreateError('')
    try {
      await adminApi.createNotification({ ...form })
      setCreateOpen(false)
      setForm(initialNotificationForm)
      reload()
    } catch (err) {
      setCreateError(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function send(id: number) {
    setMutError('')
    try {
      await adminApi.sendNotification(id)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  async function executeDelete() {
    if (pendingDeleteId == null) return
    setMutError('')
    try {
      await adminApi.deleteNotification(pendingDeleteId)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingDeleteId(null)
    }
  }

  const shownError = error || mutError

  return (
    <>
      <PageHeader
        title='通知中心'
        description='向用户推送站内通知，支持全量或定向发送。'
        actions={
          <Button
            onClick={() => {
              setCreateOpen(true)
              setCreateError('')
            }}
          >
            <PlusIcon data-icon='inline-start' />
            新建通知
          </Button>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[920px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>ID</TableHead>
              <TableHead>标题</TableHead>
              <TableHead className='w-32'>发送目标</TableHead>
              <TableHead className='w-24'>状态</TableHead>
              <TableHead className='w-44'>创建时间</TableHead>
              <TableHead className='w-44'>发送时间</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : (
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty cols={7} Icon={BellIcon} title='暂无通知' description='新建通知后会显示在这里。' />
              ) : (
                items.map((item) => {
                  const id = item.id
                  return (
                    <TableRow key={id} className={cn(item.status === 'failed' && 'shadow-[inset_2px_0_0_var(--destructive)]')}>
                      <TableCell className='tabular-nums'>{id}</TableCell>
                      <TableCell className='font-medium'>{item.title}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{targetLabel(item)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge>
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {item.sent_at ? new Date(item.sent_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell className='text-right'>
                        {id != null ? (
                          <div className='flex justify-end gap-2'>
                            {item.status === 'draft' ? (
                              <Button size='sm' variant='outline' onClick={() => void send(id)}>
                                <CheckIcon data-icon='inline-start' />
                                发送
                              </Button>
                            ) : null}
                            <Button size='sm' variant='outline' className='text-destructive' onClick={() => setPendingDeleteId(id)}>
                              <Trash2Icon data-icon='inline-start' />
                              删除
                            </Button>
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
      </div>

      <CreateNotificationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        onField={updateField}
        error={createError}
        submitting={creating}
        onSubmit={() => void create()}
      />
      <ConfirmAction
        open={pendingDeleteId != null}
        onClose={() => setPendingDeleteId(null)}
        title='确认删除'
        description='确认删除这条通知吗？已发送给用户的内容不会被收回。'
        confirmLabel='确认删除'
        onConfirm={() => void executeDelete()}
      />
    </>
  )
}
