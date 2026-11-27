import { CheckSquareIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Shown while rows are ticked: what can be done to all of them at once. */
export function BatchBar({
  count,
  onFreeze,
  onGroup,
  onUnfreeze,
  onClear,
}: {
  count: number
  onFreeze: () => void
  onGroup: () => void
  onUnfreeze: () => void
  onClear: () => void
}) {
  return (
    <div role='toolbar' aria-label='批量操作' className='glass flex animate-reveal flex-wrap items-center gap-3 px-4 py-2.5'>
      <CheckSquareIcon className='size-4 text-muted-foreground' />
      <span className='text-sm font-medium tabular-nums'>已选 {count} 人</span>
      <div className='ml-2 flex items-center gap-2'>
        <Button size='sm' variant='outline' className='text-destructive' onClick={onFreeze}>
          批量冻结
        </Button>
        <Button size='sm' variant='outline' onClick={onGroup}>
          批量设置 VIP
        </Button>
        <Button size='sm' variant='outline' onClick={onUnfreeze}>
          批量解封
        </Button>
      </div>
      <Button size='icon-sm' variant='ghost' className='ml-auto' onClick={onClear} aria-label='清除选择'>
        <XIcon />
      </Button>
    </div>
  )
}
