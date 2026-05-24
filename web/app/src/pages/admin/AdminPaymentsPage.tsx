import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { CreditCardIcon } from 'lucide-react'
import { adminApi, type AdminPaymentOrder } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

function statusBadge(s: string | undefined) {
  if (s === 'paid') return <Badge className="bg-emerald-600 text-white">已支付</Badge>
  if (s === 'failed') return <Badge variant="destructive">失败</Badge>
  if (s === 'refunded') return <Badge variant="secondary">已退款</Badge>
  return <Badge variant="outline">待支付</Badge>
}

function payChannelLabel(channel: string | undefined, payFlat: number | undefined) {
  if (channel === 'wechat') return '微信支付'
  if (channel === 'alipay') return '支付宝'
  if (channel === 'epay') return 'Epay'
  if (channel === 'shouqianba_wechat') return '收钱吧-微信'
  if (channel === 'shouqianba_alipay') return '收钱吧-支付宝'
  // fallback from pay_flat
  if (payFlat === 1) return '微信支付'
  if (payFlat === 2) return '支付宝'
  return channel || '-'
}

function payFromLabel(payFrom: string | undefined) {
  if (payFrom === 'pc') return 'PC'
  if (payFrom === 'wap') return '移动端'
  if (payFrom === 'wapwx') return '微信内'
  return payFrom || '-'
}

export function AdminPaymentsPage() {
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, loading, error, reload } = useAsync(async () => {
    const params: Record<string, unknown> = { page, size: pageSize }
    if (filterStatus) params.status = filterStatus
    if (filterEmail) params.email = filterEmail
    if (filterChannel) params.pay_channel = filterChannel
    const res = await adminApi.listPaymentOrders(params)
    return { orders: res.orders ?? [], total: res.total ?? 0 }
  }, { orders: [] as AdminPaymentOrder[], total: 0 }, [page, filterStatus, filterEmail, filterChannel])

  const totalPages = Math.ceil(data.total / pageSize)

  function handleSearch() {
    setPage(1)
    reload()
  }

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="充值订单"
        description="查看用户充值明细，支持按状态和邮箱筛选。"
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">状态</label>
            <Select value={filterStatus || '_all'} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(1) }}>
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
            <Input className="w-52" placeholder="搜索邮箱…" value={filterEmail}
              onChange={(e) => setFilterEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">充值渠道</label>
            <Select value={filterChannel || '_all'} onValueChange={(v) => { setFilterChannel(v === '_all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="epay">Epay</SelectItem>
                <SelectItem value="wechat">微信支付</SelectItem>
                <SelectItem value="alipay">支付宝</SelectItem>
                <SelectItem value="shouqianba_wechat">收钱吧-微信</SelectItem>
                <SelectItem value="shouqianba_alipay">收钱吧-支付宝</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSearch}>查询</Button>
          <Button variant="outline" onClick={() => { setFilterStatus(''); setFilterEmail(''); setFilterChannel(''); setPage(1) }}>重置</Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>商户单号</TableHead>
              <TableHead>平台单号</TableHead>
              <TableHead className="w-28 text-right">金额（¥）</TableHead>
              <TableHead className="w-28 text-right">充值额度</TableHead>
              <TableHead className="w-24">渠道</TableHead>
              <TableHead className="w-24">终端</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-40">下单时间</TableHead>
              <TableHead className="w-40">支付时间</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={11} /> : (
            <TableBody>
              {data.orders.length === 0 ? (
                <TableEmpty cols={11} Icon={CreditCardIcon} title="暂无订单" description="此条件下暂无充值订单。" />
              ) : data.orders.map((row, i) => (
                <TableRow key={row.id ?? i}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>
                    <div className="text-sm">{row.user_email}</div>
                    <div className="text-xs text-muted-foreground">UID {row.user_id}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.out_trade_no}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.trade_no || '-'}</TableCell>
                  <TableCell className="text-right font-mono">¥{(row.amount ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">¥{((row.credits ?? 0) / 1e6).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">{payChannelLabel(row.pay_channel, row.pay_flat)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payFromLabel(row.pay_from)}</TableCell>
                  <TableCell>{statusBadge(row.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.paid_at ? new Date(row.paid_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        {totalPages > 1 ? (
          <CardContent className="flex items-center justify-between border-t py-3">
            <span className="text-sm text-muted-foreground">共 {data.total} 条</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
            </div>
          </CardContent>
        ) : null}
      </Card>
    </>
  )
}
