import { Badge, StatusBadge } from '@/components/ui/badge'

/** Task state as a dot and a word, so colour is never the only signal. */
export function TaskStatus({ status }: { status: string }) {
  if (status === 'pending') return <StatusBadge tone='neutral'>排队中</StatusBadge>
  if (status === 'processing') return <StatusBadge tone='info'>处理中</StatusBadge>
  if (status === 'done') return <StatusBadge tone='success'>已完成</StatusBadge>
  if (status === 'failed') return <StatusBadge tone='danger'>失败</StatusBadge>
  return <Badge variant='outline'>{status}</Badge>
}
