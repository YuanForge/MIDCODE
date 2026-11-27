import { useState } from 'react'
import { DownloadIcon, PlusIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminExportTask } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { cn } from '@/lib/utils'
import { CreateExportDialog } from '@/pages/admin/exports/CreateExportDialog'
import { fileSize, initialExportForm, statusLabel, statusTone, typeLabel, type ExportForm } from '@/pages/admin/exports/exportForm'

/** Export tasks as a ruled ledger. A failed task carries a red edge; a finished one offers its file. */
export function AdminExportsPage() {
  const { data: tasks, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listExportTasks()
    return res.tasks ?? []
  }, [] as AdminExportTask[], [])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<ExportForm>(initialExportForm)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  function updateField<K extends keyof ExportForm>(key: K, value: ExportForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function create() {
    setCreating(true)
    setCreateError('')
    try {
      await adminApi.createExportTask({ name: form.name, type: form.type, params: {} })
      setCreateOpen(false)
      setForm(initialExportForm)
      reload()
    } catch (err) {
      setCreateError(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <PageHeader
        title='数据导出'
        description='提交异步导出任务，处理完成后可下载文件。'
        actions={
          <>
            <Button variant='outline' onClick={reload}>刷新状态</Button>
            <Button
              onClick={() => {
                setCreateOpen(true)
                setCreateError('')
              }}
            >
              <PlusIcon data-icon='inline-start' />
              新建导出
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[1040px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className='w-28'>类型</TableHead>
              <TableHead className='w-24'>状态</TableHead>
              <TableHead className='w-24 text-right'>进度</TableHead>
              <TableHead className='w-28 text-right'>文件大小</TableHead>
              <TableHead className='w-44'>创建时间</TableHead>
              <TableHead className='w-44'>过期时间</TableHead>
              <TableHead className='text-right'>下载</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={9} />
          ) : (
            <TableBody>
              {tasks.length === 0 ? (
                <TableEmpty cols={9} Icon={DownloadIcon} title='暂无导出任务' description='点击「新建导出」创建任务。' />
              ) : (
                tasks.map((task) => (
                  <TableRow key={task.id} className={cn(task.status === 'failed' && 'shadow-[inset_2px_0_0_var(--destructive)]')}>
                    <TableCell className='tabular-nums'>{task.id}</TableCell>
                    <TableCell className='font-medium'>{task.name}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{typeLabel(task.type)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(task.status)}>{statusLabel(task.status)}</StatusBadge>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{task.status === 'running' ? `${task.progress ?? 0}%` : '-'}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{fileSize(task.file_size)}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {task.created_at ? new Date(task.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {task.expires_at ? new Date(task.expires_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className='text-right'>
                      {task.status === 'done' && task.file_url ? (
                        <Button size='sm' variant='outline' asChild>
                          <a href={task.file_url} target='_blank' rel='noreferrer'>
                            <DownloadIcon data-icon='inline-start' />
                            下载
                          </a>
                        </Button>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <CreateExportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        onField={updateField}
        error={createError}
        submitting={creating}
        onSubmit={() => void create()}
      />
    </>
  )
}
