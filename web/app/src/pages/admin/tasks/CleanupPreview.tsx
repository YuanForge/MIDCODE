import type { ReactNode } from 'react'

import type { AdminCleanupPreview } from '@/lib/api/admin'
import { cleanupStatusText, formatDateTime, targetLabel } from '@/pages/admin/tasks/taskFormat'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  )
}

/** What a clean-up would remove under the current settings. Shown after a preview and again after a run, with what is left. */
export function PreviewFacts({ preview }: { preview: AdminCleanupPreview }) {
  return (
    <dl className='grid gap-4 border-t border-glass-border pt-4 md:grid-cols-4'>
      <Fact label='预计可清理'>
        <span className='text-lg font-semibold tabular-nums'>{preview.count.toLocaleString()}</span>
      </Fact>
      <Fact label='清理类型'>{preview.target_label || targetLabel(preview.target)}</Fact>
      <Fact label='早于时间'>{formatDateTime(preview.cutoff)}</Fact>
      <Fact label='允许状态'>{preview.statuses.map(cleanupStatusText).join('、') || '-'}</Fact>
    </dl>
  )
}
