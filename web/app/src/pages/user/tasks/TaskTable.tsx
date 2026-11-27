import { ListIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { UserTask } from '@/lib/api/user'
import { cn } from '@/lib/utils'
import { TaskStatus } from '@/pages/user/tasks/TaskStatus'
import { resolveStatus, typeLabel } from '@/pages/user/tasks/taskModel'

const COLS = 7

/** Task ledger: one ruled row per task. A failed task also gets a red edge, in addition to its word and dot. */
export function TaskTable({
  rows,
  loading,
  onOpen,
}: {
  rows: UserTask[]
  loading: boolean
  onOpen: (id: number) => void
}) {
  return (
    <div className='glass overflow-hidden'>
      <Table className='min-w-[820px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-20'>ID</TableHead>
            <TableHead className='w-28'>类型</TableHead>
            <TableHead className='w-36'>请求时间</TableHead>
            <TableHead className='w-32 text-right'>消耗积分</TableHead>
            <TableHead className='w-28'>状态</TableHead>
            <TableHead>错误信息</TableHead>
            <TableHead className='w-16 text-center'>操作</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton cols={COLS} />
        ) : (
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty
                cols={COLS}
                Icon={ListIcon}
                title='还没有任务记录'
                description='发起图片、视频、音频或音乐生成后，任务会显示在这里。'
              />
            ) : (
              rows.map((row, index) => {
                const taskId = row.id ?? row.task_id
                const status = resolveStatus(row)
                const errorMessage = row.error_msg ?? row.msg
                return (
                  <TableRow
                    key={taskId ?? index}
                    className={cn(status === 'failed' && 'shadow-[inset_2px_0_0_var(--destructive)]')}
                  >
                    <TableCell className='tabular-nums'>{taskId ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant='secondary' className='text-xs'>
                        {typeLabel(row.type ?? row.task_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className='text-right font-mono text-sm'>
                      {row.credits_charged != null ? (
                        <span className='font-medium text-foreground'>−{(row.credits_charged / 1e6).toFixed(4)}</span>
                      ) : (
                        <span className='text-muted-foreground'>-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TaskStatus status={status} />
                    </TableCell>
                    <TableCell className='max-w-48 truncate text-xs text-destructive' title={errorMessage}>
                      {errorMessage ?? <span className='text-muted-foreground'>-</span>}
                    </TableCell>
                    <TableCell className='text-center'>
                      {taskId != null ? (
                        <Button size='sm' variant='ghost' onClick={() => onOpen(taskId)}>
                          详情
                        </Button>
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
  )
}
