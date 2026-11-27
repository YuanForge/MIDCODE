import { Badge, StatusBadge } from '@/components/ui/badge'
import { formatTokenPricePerMillion } from '@/lib/formatters/credits'

export function Dash() {
  return <span className='text-muted-foreground/50'>-</span>
}

/**
 * Status chip for one call. It always has a dot and a word, so colour is never the only signal.
 * Success keeps an emerald text colour in light mode (the e2e suite checks for `text-emerald-700`).
 */
export function LogStatus({ status }: { status?: string }) {
  if (status === 'ok') {
    return <StatusBadge tone='success' className='text-emerald-700 dark:text-success'>成功</StatusBadge>
  }
  if (status === 'error') return <StatusBadge tone='danger'>失败</StatusBadge>
  if (status === 'refunded') return <StatusBadge tone='neutral'>已退款</StatusBadge>
  if (status === 'pending') return <StatusBadge tone='info'>进行中</StatusBadge>
  return <Badge variant='outline'>{status ?? '-'}</Badge>
}

export function TokenPrice({ value }: { value?: number | null }) {
  if (value == null) return <Dash />
  return <span className='text-[13px] text-muted-foreground'>{formatTokenPricePerMillion(value)}</span>
}
