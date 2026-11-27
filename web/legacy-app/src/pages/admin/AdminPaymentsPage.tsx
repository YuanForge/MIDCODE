import { useState } from 'react'
import { CreditCardIcon } from 'lucide-react'

import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { adminApi, type AdminPaymentDailySummary, type AdminPaymentOrder, type AdminPaymentSummary } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

function statusBadge(status: string | undefined, source: string | undefined) {
  if (source === 'card') return <Badge className="bg-emerald-600 text-white">已兑换</Badge>
  if (status === 'paid') return <Badge className="bg-emerald-600 text-white">已支付</Badge>
  if (status === 'failed') return <Badge variant="destructive">失败</Badge>
  if (status === 'refunded') return <Badge variant="secondary">已退款</Badge>
  return <Badge variant="outline">待支付</Badge>
}

function sourceBadge(source: string | undefined) {
  if (source === 'card') return <Badge variant="secondary">卡密兑换</Badge>
  return <Badge variant="outline">在线充值</Badge>
}

function payChannelLabel(channel: string | undefined, payFlat: number | undefined) {
  if (channel === 'card') return '卡密兑换'
  if (channel === 'wechat') return '微信支付'
  if (channel === 'alipay') return '支付宝'
  if (channel === 'epay') return 'Epay'
  if (channel === 'shouqianba_wechat') return '收钱吧微信'
  if (channel === 'shouqianba_alipay') return '收钱吧支付宝'
  if (payFlat === 1) return '微信支付'
  if (payFlat === 2) return '支付宝'
  return channel || '-'
}

function payFromLabel(payFrom: string | undefined) {
  if (payFrom === 'pc') return 'PC'
  if (payFrom === 'wap') return '移动端'
  if (payFrom === 'wapwx') return '微信内'
  if (payFrom === 'redeem') return '兑换'
  return payFrom || '-'
}

function formatMoney(value: number | undefined, digits = 4) {
  return `¥${(value ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function formatDate(value: string | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function apiDateTime(value: string) {
  if (!value) return ''
  return value.length === 16 ? `${value.replace('T', ' ')}:00` : value.replace('T', ' ')
}

function buildPaymentParams({
  page,
  size,
  status,
  email,
  channel,
  startAt,
  endAt,
}: {
  page: number
  size: number
  status: string
  email: string
  channel: string
  startAt: string
  endAt: string
}) {
  const params: Record<string, unknown> = { page, size }
  if (status) params.status = status
  if (email.trim()) params.email = email.trim()
  if (channel) params.pay_channel = channel
  if (startAt) params.start_at = apiDateTime(startAt)
  if (endAt) params.end_at = apiDateTime(endAt)
  return params
}

export function AdminPaymentsPage() {
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({ page: 1, size: pageSize })

  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listPaymentOrders(queryParams)
    return {
      orders: res.orders ?? [],
      total: res.total ?? 0,
      summary: res.summary ?? {},
      daily: res.daily ?? [],
    }
  }, {
    orders: [] as AdminPaymentOrder[],
    total: 0,
    summary: {} as AdminPaymentSummary,
    daily: [] as AdminPaymentDailySummary[],
  }, [queryParams])

  function handleSearch() {
    setPage(1)
    setQueryParams(buildPaymentParams({
      page: 1,
      size: pageSize,
      status: filterStatus,
      email: filterEmail,
      channel: filterChannel,
      startAt,
      endAt,
    }))
  }

  function resetSearch() {
    setFilterStatus('')
    setFilterEmail('')
    setFilterChannel('')
    setStartAt('')
    setEndAt('')
    setPage(1)
    setQueryParams({ page: 1, size: pageSize })
  }

  function changePage(next: number) {
    setPage(next)
    setQueryParams((prev) => ({ ...prev, page: next }))
  }

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="充值订单"
        description="在线支付与卡密兑换统一展示，按下单时间和兑换时间排序统计毛利润。"
        actions={error ? (
          <Button size="sm" variant="outline" onClick={reload}>
            重试
          </Button>
        ) : null}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error)}</AlertDescription>
        </Alert>
      ) : null}

      <FilterBar
        filters={
          <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">状态</label>
            <Select value={filterStatus || '_all'} onValueChange={(v) => setFilterStatus(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="pending">待支付</SelectItem>
                <SelectItem value="paid">已支付</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="refunded">已退款</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">用户邮箱</label>
            <Input
              className="w-52"
              placeholder="搜索邮箱..."
              value={filterEmail}
              onChange={(e) => setFilterEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">来源/渠道</label>
            <Select value={filterChannel || '_all'} onValueChange={(v) => setFilterChannel(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="card">卡密兑换</SelectItem>
                <SelectItem value="epay">Epay</SelectItem>
                <SelectItem value="wechat">微信支付</SelectItem>
                <SelectItem value="alipay">支付宝</SelectItem>
                <SelectItem value="shouqianba_wechat">收钱吧微信</SelectItem>
                <SelectItem value="shouqianba_alipay">收钱吧支付宝</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DateRangeFilter
            label="时间"
            startAt={startAt}
            endAt={endAt}
            onChange={({ startAt: nextStart, endAt: nextEnd }) => {
              setStartAt(nextStart)
              setEndAt(nextEnd)
            }}
          />
          </>
        }
        actions={
          <>
          <Button onClick={handleSearch}>查询</Button>
          <Button variant="outline" onClick={resetSearch}>重置</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">毛利润合计</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{formatMoney(data.summary.gross_profit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">在线充值毛利</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(data.summary.payment_gross_profit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">卡密兑换毛利</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(data.summary.card_gross_profit)}</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">每日毛利润</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[220px] overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead className="text-right">合计</TableHead>
                  <TableHead className="text-right">在线</TableHead>
                  <TableHead className="text-right">卡密</TableHead>
                  <TableHead className="text-right">笔数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.daily.length === 0 ? (
                  <TableEmpty cols={5} Icon={CreditCardIcon} title="暂无毛利润" description="有已支付订单或卡密兑换后会显示每日汇总。" />
                ) : data.daily.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell className="font-mono text-sm">{row.day}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-blue-600">{formatMoney(row.gross_profit)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoney(row.payment_gross_profit)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoney(row.card_gross_profit)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{row.count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <Table className="min-w-[1500px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">来源</TableHead>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>单号 / 卡密</TableHead>
              <TableHead className="w-28 text-right">金额</TableHead>
              <TableHead className="w-28 text-right">充值额度</TableHead>
              <TableHead className="w-28 text-right">毛利润</TableHead>
              <TableHead className="w-28">渠道</TableHead>
              <TableHead className="w-24">终端</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-40">下单/兑换时间</TableHead>
              <TableHead className="w-40">支付/兑换时间</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={13} /> : (
            <TableBody>
              {data.orders.length === 0 ? (
                <TableEmpty cols={13} Icon={CreditCardIcon} title="暂无记录" description="此条件下暂无充值订单或卡密兑换记录。" />
              ) : data.orders.map((row, index) => (
                <TableRow key={`${row.source ?? 'payment'}-${row.id ?? index}`}>
                  <TableCell>{sourceBadge(row.source)}</TableCell>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>
                    <div className="text-sm">{row.user_email || '-'}</div>
                    <div className="text-xs text-muted-foreground">UID {row.user_id}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.card_code || row.out_trade_no || '-'}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(row.amount, 2)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney((row.credits ?? 0) / 1e6, 2)}</TableCell>
                  <TableCell className="text-right font-mono text-blue-600">{formatMoney(row.gross_profit)}</TableCell>
                  <TableCell className="text-sm">{payChannelLabel(row.pay_channel, row.pay_flat)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payFromLabel(row.pay_from)}</TableCell>
                  <TableCell>{statusBadge(row.status, row.source)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(row.event_time ?? row.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(row.paid_at ?? (row.source === 'card' ? row.event_time : undefined))}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground" title={row.note}>
                    {row.note || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        {data.total > 0 ? (
          <TablePagination current={page} total={data.total} pageSize={pageSize} onChange={changePage} className="rounded-none border-x-0 border-b-0" />
        ) : null}
      </Card>
    </>
  )
}
