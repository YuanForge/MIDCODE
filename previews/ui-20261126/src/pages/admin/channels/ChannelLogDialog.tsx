import { ScrollTextIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminChannel, type AdminChannelLog } from '@/lib/api/admin'

function LogTable({ channelId }: { channelId: number }) {
  const { data: logs, loading, error } = useAsync(async () => {
    const res = await adminApi.listChannelLogs(channelId)
    return (Array.isArray(res) ? res : (res as { logs?: AdminChannelLog[] }).logs ?? []) as AdminChannelLog[]
  }, [] as AdminChannelLog[], [channelId])

  return (
    <div className='flex flex-col gap-3'>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='max-h-[60vh] overflow-auto rounded-xl border border-glass-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-44'>时间</TableHead>
              <TableHead className='w-24'>操作人</TableHead>
              <TableHead className='w-40'>字段</TableHead>
              <TableHead>前值</TableHead>
              <TableHead>后值</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={5} rows={4} />
          ) : (
            <TableBody>
              {logs.length === 0 ? (
                <TableEmpty cols={5} Icon={ScrollTextIcon} title='暂无变更记录' />
              ) : (
                logs.map((log, index) => (
                  <TableRow key={log.id ?? index}>
                    <TableCell className='text-sm text-muted-foreground'>{log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}</TableCell>
                    <TableCell className='text-sm tabular-nums'>{log.admin_id ? `#${log.admin_id}` : '-'}</TableCell>
                    <TableCell className='font-mono text-xs'>{log.field ?? '-'}</TableCell>
                    <TableCell className='max-w-xs break-all font-mono text-xs text-muted-foreground'>
                      <span className='line-clamp-3'>{log.old_val ?? '-'}</span>
                    </TableCell>
                    <TableCell className='max-w-xs break-all font-mono text-xs'>
                      <span className='line-clamp-3'>{log.new_val ?? '-'}</span>
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

/** Who changed which field of a channel, and from what to what. */
export function ChannelLogDialog({ channel, onClose }: { channel: AdminChannel | null; onClose: () => void }) {
  return (
    <Dialog
      open={channel != null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className='sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>渠道变更日志</DialogTitle>
          <DialogDescription>{channel?.name ?? channel?.model ?? `#${channel?.id}`}</DialogDescription>
        </DialogHeader>
        {channel?.id ? <LogTable channelId={channel.id} /> : null}
      </DialogContent>
    </Dialog>
  )
}
