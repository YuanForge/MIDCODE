import { cn } from '@/lib/utils'

/**
 * One recharge package, set as a row in a price list. It is a plain toggle button (pressed = chosen),
 * so the list reads as ruled lines rather than a grid of tiles.
 */
export function PlanOption({
  credits,
  bonus,
  amount,
  originAmount,
  desc,
  active,
  onSelect,
}: {
  credits: number
  bonus?: number
  amount: number
  originAmount?: number
  desc?: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-4 px-3 py-4 text-left outline-none transition-colors duration-140 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
        active ? 'bg-glass-strong shadow-[inset_2px_0_0_var(--brand)]' : 'hover:bg-glass-strong/60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-140',
          active ? 'border-brand' : 'border-input-hover',
        )}
      >
        <span
          className={cn(
            'size-2 rounded-full bg-brand transition-transform duration-140 ease-out',
            active ? 'scale-100' : 'scale-0',
          )}
        />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex flex-wrap items-baseline gap-x-2'>
          <span className='text-lg font-semibold tracking-tight text-foreground tabular-nums'>{`${credits} 积分`}</span>
          {bonus ? <span className='text-[13px] font-medium text-success tabular-nums'>{`+${bonus}`}</span> : null}
        </span>
        {desc ? <span className='text-xs leading-5 text-muted-foreground'>{desc}</span> : null}
      </span>
      <span className='flex shrink-0 items-baseline gap-2'>
        <span className='text-[15px] font-medium text-foreground tabular-nums'>{`¥${amount}`}</span>
        {originAmount ? (
          <span className='text-xs text-muted-foreground line-through tabular-nums'>{`¥${originAmount}`}</span>
        ) : null}
      </span>
    </button>
  )
}
