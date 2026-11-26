import type { ReactNode } from 'react'
import { XIcon } from 'lucide-react'

import { CodeBlock } from '@/components/shared/CodeBlock'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { UserLog } from '@/lib/api/user'
import { formatCredits, formatTokenPricePerMillion } from '@/lib/formatters/credits'
import { formatCallDuration } from '@/lib/formatters/duration'
import { cn } from '@/lib/utils'
import { LogStatus } from '@/pages/user/logs/LogCells'

type Fact = { label: string; value: ReactNode; mono?: boolean }

// A value the record does not carry is shown as a dash. It is never filled in with a zero.
const NONE = '—'

function Chip({ children }: { children: ReactNode }) {
  return (
    <Badge variant='outline' className='h-4 px-1 py-0 text-[10px]'>
      {children}
    </Badge>
  )
}

function tierText(log: UserLog) {
  if (log.usage?.tier_downgraded) return 'Fast → 标准（已退差价）'
  if (log.usage?.actual_tier === 'fast') return 'Fast'
  if (log.usage?.actual_tier === 'standard') return '标准'
  return NONE
}

/**
 * Local date and time, or null when the record has none. The list does not load updated_at, so a row carries
 * Go's zero time (year 1) there until the full record arrives. That is a missing value, not a moment.
 */
function formatTime(value?: string) {
  if (!value) return null
  // The detail endpoint writes a space between the date and the time. With a T it is the form every browser reads.
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return null
  return date.toLocaleString('zh-CN')
}

function formatPrice(value?: number | null) {
  return value == null ? NONE : formatTokenPricePerMillion(value)
}

/** Net credits the call cost, after refunds. Zero when nothing was charged or the record does not say. */
function chargedOf(log: UserLog) {
  return log.credits_charged ?? log.cost_credits ?? 0
}

function buildFacts(log: UserLog, loading: boolean): Fact[] {
  const charged = chargedOf(log)
  const finishedAt = log.status !== 'pending' ? formatTime(log.updated_at) : null
  return [
    { label: '消耗', value: charged ? `${formatCredits(charged)} 积分` : NONE },
    { label: '耗时', value: formatCallDuration(log.latency_ms) ?? NONE },
    { label: '输入 tokens', value: log.usage?.prompt_tokens?.toLocaleString() ?? NONE },
    {
      label: '输出 tokens',
      value: (
        <span className='inline-flex items-center gap-1.5'>
          {log.usage?.completion_tokens?.toLocaleString() ?? NONE}
          {log.usage?.estimated ? <Chip>估算</Chip> : null}
        </span>
      ),
    },
    { label: '是否流式', value: log.is_stream == null ? NONE : log.is_stream ? '是' : '否' },
    {
      label: '服务档位',
      value: (
        <span className='inline-flex flex-wrap items-center gap-1.5'>
          {tierText(log)}
          {log.usage?.tier_unconfirmed ? <Chip>未确认</Chip> : null}
        </span>
      ),
    },
    { label: '输入价格', value: formatPrice(log.input_price_per_1m_tokens) },
    { label: '输出价格', value: formatPrice(log.output_price_per_1m_tokens) },
    // Only the full record has the completion time, so it waits for that record instead of showing a dash first.
    { label: '完成时间', value: loading ? <Skeleton className='h-5 w-28' /> : (finishedAt ?? NONE) },
    { label: '日志 ID', value: log.id ?? NONE, mono: true },
  ]
}

function buildPayloads(log: UserLog): Array<{ title: string; data?: Record<string, unknown> }> {
  return [
    { title: '您的请求', data: log.client_request },
    { title: '上游请求头', data: log.upstream_headers },
    { title: '上游请求体', data: log.upstream_request },
    { title: '上游响应', data: log.upstream_response },
    { title: '返回给您的响应', data: log.client_response },
  ]
}

/**
 * One call in full. It is the single body for both containers, the panel beside the table and the drawer, and
 * it renders two children for a flex column: a head that stays put and a body that scrolls.
 * From the top: which model and how it ended, when and under which request id, why it failed if it did, the
 * facts as a ruled statement, then the raw request and response bodies as code blocks.
 * `log` starts as the list row, so the detail opens at once. Whatever only the full record carries shows a
 * loading state until that record arrives, and an alert with a retry if it cannot be fetched.
 */
export function LogDetail({
  log,
  loading,
  error,
  onRetry,
  onClose,
}: {
  log: UserLog
  loading: boolean
  error: string
  onRetry: () => void
  onClose: () => void
}) {
  const failed = log.status === 'error'
  const charged = chargedOf(log)
  const facts = buildFacts(log, loading)
  const payloads = buildPayloads(log).filter((payload) => payload.data)

  return (
    <>
      <header className='flex shrink-0 flex-col gap-0.5 border-b border-glass-border py-3 pr-3 pl-5'>
        <div className='flex items-center gap-2.5'>
          <h2 className='min-w-0 truncate text-base font-semibold text-foreground' title={log.model}>
            {log.model || NONE}
          </h2>
          <LogStatus status={log.status} />
          <Button variant='ghost' size='icon-sm' aria-label='关闭详情' className='ml-auto text-muted-foreground hover:text-foreground' onClick={onClose}>
            <XIcon />
          </Button>
        </div>
        <div className='flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground'>
          <span className='shrink-0'>{formatTime(log.created_at) ?? NONE}</span>
          {log.corr_id ? (
            <>
              <span className='min-w-0 truncate font-mono text-xs' title={log.corr_id}>
                {log.corr_id}
              </span>
              <CopyButton value={log.corr_id} label='复制请求 ID' />
            </>
          ) : (
            <span>{NONE}</span>
          )}
        </div>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto' aria-busy={loading}>
        <div className='flex flex-col gap-4 px-5 pt-4 pb-5'>
          {/* The reason leads when the call failed. A call that ended another way can still carry a message, and that is shown too. */}
          {failed || log.error_msg ? (
            <div className='rounded-2xl bg-destructive/8 p-3.5 text-[13px]'>
              <p className='font-medium text-destructive break-words whitespace-pre-wrap'>
                {log.error_msg || '这次调用失败了，上游没有返回原因。'}
              </p>
              {/* The charge is read from the ledger figure, because a failed call is not always free. */}
              {failed ? (
                <p className='mt-1 text-foreground'>
                  {charged > 0 ? `这次调用扣了 ${formatCredits(charged)} 积分。` : '这次调用没有扣费。'}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <Alert variant='destructive'>
              <AlertTitle>完整记录没有加载出来，下面只有列表里已有的信息。</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
              <Button variant='outline' size='sm' className='col-start-2 mt-1 justify-self-start' onClick={onRetry}>
                重试
              </Button>
            </Alert>
          ) : null}

          <dl className='grid grid-cols-2 gap-x-4 gap-y-3'>
            {facts.map((fact) => (
              <div key={fact.label} className='flex min-w-0 flex-col gap-1 border-b border-glass-border pb-3'>
                <dt className='text-xs text-muted-foreground'>{fact.label}</dt>
                <dd className={cn('text-sm text-foreground', fact.mono ? 'font-mono text-[13px] break-all' : 'tabular-nums')}>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          {loading ? (
            <Skeleton className='h-40' />
          ) : (
            payloads.map((payload) => (
              <CodeBlock
                key={payload.title}
                title={payload.title}
                code={JSON.stringify(payload.data, null, 2)}
                wrap
                bodyClassName='max-h-[320px]'
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

/** The drawer that holds the detail on a window too narrow to show it beside the table. */
export function LogDetailSheet({
  open,
  onOpenChange,
  log,
  loading,
  error,
  onRetry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  log: UserLog | null
  loading: boolean
  error: string
  onRetry: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The detail brings its own close button, and its heading is the model, so the drawer is named for screen readers only. */}
      <SheetContent
        showCloseButton={false}
        className='w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[min(96vw,960px)]'
      >
        <SheetTitle className='sr-only'>日志详情</SheetTitle>
        <SheetDescription className='sr-only'>这次调用的状态、用量、扣费，以及请求和响应内容。</SheetDescription>
        {log ? (
          <LogDetail log={log} loading={loading} error={error} onRetry={onRetry} onClose={() => onOpenChange(false)} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
