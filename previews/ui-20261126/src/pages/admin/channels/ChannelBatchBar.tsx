import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Shown while rows are ticked: what can be done to all of them at once. */
export function ChannelBatchBar({
  count,
  busy,
  onEnable,
  onDisable,
  onWeight,
  onClear,
}: {
  count: number
  busy: boolean
  onEnable: () => void
  onDisable: () => void
  onWeight: () => void
  onClear: () => void
}) {
  return (
    <div role='toolbar' aria-label='批量操作' className='glass flex animate-reveal flex-wrap items-center gap-3 px-4 py-2.5'>
      <span className='text-sm font-medium tabular-nums'>已选 {count} 个渠道</span>
      <div className='ml-2 flex items-center gap-2'>
        <Button size='sm' variant='outline' disabled={busy} onClick={onEnable}>
          批量启用
        </Button>
        <Button size='sm' variant='outline' disabled={busy} onClick={onDisable}>
          批量停用
        </Button>
        <Button size='sm' variant='outline' disabled={busy} onClick={onWeight}>
          批量设权重
        </Button>
      </div>
      <Button size='icon-sm' variant='ghost' className='ml-auto' onClick={onClear} aria-label='清除选择'>
        <XIcon />
      </Button>
    </div>
  )
}
