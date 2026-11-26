import { useRef, useState } from 'react'
import { ExternalLinkIcon, LoaderCircleIcon, TicketIcon } from 'lucide-react'
import { toast } from 'sonner'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { userApi, type RedeemRecord } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'

type CardRedemptionSectionProps = {
  purchaseUrl: string
  onRedeemed: () => void
}

const mutationErrorId = 'card-redemption-error'

/**
 * Card redemption sheet: the form on the left, the redemption history on the right as a ruled table.
 * Below xl the two stack, and the history scrolls sideways inside its own container.
 */
export function CardRedemptionSection({ purchaseUrl, onRedeemed }: CardRedemptionSectionProps) {
  const { data: history, loading, error: loadError, reload } = useAsync(async () => {
    const response = await userApi.getRedeemHistory()
    return Array.isArray(response) ? response : response.records ?? response.list ?? []
  }, [] as RedeemRecord[])
  const [code, setCode] = useState('')
  const [mutError, setMutError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  async function redeem() {
    const trimmedCode = code.trim()
    if (!trimmedCode || submittingRef.current) return

    submittingRef.current = true
    setSubmitting(true)
    setMutError('')
    try {
      const res = await userApi.redeemCard(trimmedCode)
      const credits = typeof res?.credits === 'number' ? res.credits : null
      toast.success(credits ? `兑换成功，获得 ${formatCredits(credits)} 积分` : '兑换成功')
      setCode('')
      reload()
      onRedeemed()
    } catch (err) {
      const message = getApiErrorMessage(err)
      setMutError(message)
      toast.error(message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <Card className='gap-0 overflow-hidden py-0 xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
      <div className='flex flex-col gap-4 p-5'>
        <div className='flex flex-col gap-1'>
          <h2 className='text-[15px] font-semibold text-foreground'>卡密充值</h2>
          <p className='text-[13px] leading-5 text-muted-foreground'>输入卡密兑换积分，兑换后会立即计入账户余额。</p>
        </div>
        <div className='flex flex-col gap-2'>
          <label className='sr-only' htmlFor="card-redemption-code">
            卡密
          </label>
          <Input
            id='card-redemption-code'
            className='font-mono'
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder='请输入卡密'
            aria-invalid={Boolean(mutError)}
            aria-describedby={mutError ? mutationErrorId : undefined}
            onKeyDown={(event) => event.key === 'Enter' && void redeem()}
          />
          <Button variant='outline' onClick={redeem} disabled={submitting || !code.trim()}>
            {submitting ? <LoaderCircleIcon className='animate-spin' data-icon='inline-start' /> : null}
            {submitting ? '兑换中...' : '立即兑换'}
          </Button>
        </div>
        {mutError ? (
          <Alert id={mutationErrorId} variant='destructive'>
            <AlertDescription>{mutError}</AlertDescription>
          </Alert>
        ) : null}
        {purchaseUrl ? (
          <a
            href={purchaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className='inline-flex w-fit items-center gap-1 text-[13px] font-medium text-brand underline-offset-4 hover:underline'
          >
            购买卡密
            <ExternalLinkIcon className='size-3.5' />
          </a>
        ) : null}
      </div>

      <div className='min-w-0 border-t xl:border-t-0 xl:border-l'>
        <div className='flex items-center justify-between px-4 py-3'>
          <h3 className='text-sm font-medium text-foreground'>卡密兑换记录</h3>
          {!loading && history.length > 0 ? (
            <span className='text-xs text-muted-foreground tabular-nums'>{history.length} 条</span>
          ) : null}
        </div>
        {loadError ? (
          <div className='px-4 pb-4'>
            <Alert variant='destructive'>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <Table className='min-w-[480px]'>
            <TableHeader>
              <TableRow>
                <TableHead>卡密</TableHead>
                <TableHead className='text-right'>积分数量</TableHead>
                <TableHead>兑换时间</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton cols={3} rows={2} />
            ) : (
              <TableBody>
                {history.length === 0 ? (
                  <TableEmpty
                    cols={3}
                    Icon={TicketIcon}
                    title='还没有兑换记录'
                    description='使用左侧输入框兑换卡密后，记录会显示在这里。'
                  />
                ) : (
                  history.map((row, index) => (
                    <TableRow key={row.code ?? index}>
                      <TableCell className='font-mono text-xs'>{row.code ?? '-'}</TableCell>
                      <TableCell className='text-right font-mono text-[13px] text-success'>
                        +{formatCredits(row.credits ?? 0)}
                      </TableCell>
                      <TableCell className='text-[13px] text-muted-foreground'>
                        {row.used_at ? new Date(row.used_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            )}
          </Table>
        )}
      </div>
    </Card>
  )
}
