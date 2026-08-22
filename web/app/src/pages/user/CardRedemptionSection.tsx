import { useRef, useState } from 'react'
import { ExternalLinkIcon, TicketIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageSection } from '@/components/shared/PageSection'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
    <>
      <PageSection title="卡密充值" description="输入卡密兑换积分，兑换后会立即计入账户余额。">
        {mutError ? (
          <Alert id={mutationErrorId} variant="destructive" className="mb-4">
            <AlertDescription>{mutError}</AlertDescription>
          </Alert>
        ) : null}
        {purchaseUrl ? (
          <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">没有卡密？可前往发卡网购买后再回来兑换。</span>
            <Button asChild variant="outline" size="sm">
              <a href={purchaseUrl} target="_blank" rel="noopener noreferrer">
                购买卡密
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </Button>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="card-redemption-code">卡密</label>
          <Input
            id="card-redemption-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="请输入卡密"
            aria-invalid={Boolean(mutError)}
            aria-describedby={mutError ? mutationErrorId : undefined}
            onKeyDown={(event) => event.key === 'Enter' && void redeem()}
          />
          <Button onClick={redeem} disabled={submitting || !code.trim()}>
            {submitting ? '兑换中...' : '立即兑换'}
          </Button>
        </div>
      </PageSection>

      <PageSection title="卡密兑换记录" description="展示已使用卡密、到账积分和兑换时间。">
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[620px]">
              <TableHeader>
                <TableRow>
                  <TableHead>卡密</TableHead>
                  <TableHead>积分数量</TableHead>
                  <TableHead>兑换时间</TableHead>
                </TableRow>
              </TableHeader>
              {loading ? (
                <TableSkeleton cols={3} />
              ) : (
                <TableBody>
                  {history.length === 0 ? (
                    <TableEmpty
                      cols={3}
                      Icon={TicketIcon}
                      title="还没有兑换记录"
                      description="使用上方输入框兑换卡密后，记录会显示在这里。"
                    />
                  ) : (
                    history.map((row, index) => (
                      <TableRow key={row.code ?? index}>
                        <TableCell className="font-mono text-xs">{row.code ?? '-'}</TableCell>
                        <TableCell>{formatCredits(row.credits ?? 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.used_at ? new Date(row.used_at).toLocaleString('zh-CN') : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              )}
            </Table>
          </div>
        )}
      </PageSection>
    </>
  )
}
