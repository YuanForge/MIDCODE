import { useState } from 'react'
import { WalletCardsIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { adminApi, type AdminTransaction, type AdminTransactionSummary } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

function toMoney(cny: number | undefined) {
  return (cny ?? 0).toFixed(4)
}

function txTypeLabel(t: string | undefined) {
  return ({ charge: '扣费', refund: '退款', recharge: '充值', hold: '预扣', settle: '结算' } as Record<string, string>)[t ?? ''] ?? (t ?? '-')
}

function txTypeVariant(t: string | undefined): 'destructive' | 'secondary' | 'outline' {
  if (t === 'charge' || t === 'hold' || t === 'settle') return 'destructive'
  if (t === 'refund' || t === 'recharge') return 'secondary'
  return 'outline'
}

function profitOf(row: AdminTransaction) {
  if (row.profit != null) return row.profit
  const amount = row.amount ?? 0
  const cost = row.cost ?? 0
  if (row.type === 'refund') return -(amount - cost)
  if (row.type === 'charge' || row.type === 'settle' || row.type === 'hold') return amount - cost
  return 0
}

export function AdminBillingPage() {
  const [activeTab, setActiveTab] = useState('detail')
  const [page, setPage] = useState(1)
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [txType, setTxType] = useState('')
  const [userId, setUserId] = useState('')
  const [searchParams, setSearchParams] = useState<Record<string, unknown>>({ page: 1 })

  // 手动调账 dialog
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ user_id: '', type: 'recharge', credits: '', reason: '' })
  const [adjustError, setAdjustError] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  // 按月导出
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [exporting, setExporting] = useState(false)

  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listTransactions(searchParams)
    const transactions = Array.isArray(res) ? res : res.transactions ?? res.items ?? []
    const total = Array.isArray(res) ? transactions.length : (res as { total?: number }).total ?? transactions.length
    const summary: AdminTransactionSummary = Array.isArray(res) ? {} : (res as { summary?: AdminTransactionSummary }).summary ?? {}
    return { transactions, total, summary }
  }, { transactions: [] as AdminTransaction[], total: 0, summary: {} as AdminTransactionSummary }, [searchParams])

  const pageSize = 20
  const totalPages = Math.ceil(data.total / pageSize)

  function doSearch() {
    const params: Record<string, unknown> = { page: 1, size: pageSize }
    if (startAt) params.start_at = startAt.replace('T', ' ') + ':00'
    if (endAt) params.end_at = endAt.replace('T', ' ') + ':00'
    if (txType) params.type = txType
    if (userId) params.user_id = userId
    setPage(1)
    setSearchParams(params)
  }

  function resetSearch() {
    setStartAt('')
    setEndAt('')
    setTxType('')
    setUserId('')
    setPage(1)
    setSearchParams({ page: 1 })
  }

  function changePage(next: number) {
    setPage(next)
    setSearchParams((prev) => ({ ...prev, page: next }))
  }

  // 聚合视图数据
  const aggDim = activeTab === 'detail' ? '' : activeTab
  const { data: aggData, loading: aggLoading } = useAsync(async () => {
    if (!aggDim) return { rows: [] as { key: string; revenue: number; cost: number; profit: number; calls: number }[] }
    return adminApi.getTransactionAggregate({ dim: aggDim })
  }, { rows: [] as { key: string; revenue: number; cost: number; profit: number; calls: number }[] }, [aggDim])

  async function submitAdjust() {
    if (!adjustForm.user_id || !adjustForm.credits || !adjustForm.reason) {
      setAdjustError('请填写所有必填字段')
      return
    }
    if (adjustForm.reason.length < 10) {
      setAdjustError('调账原因至少 10 个字符')
      return
    }
    setAdjustError('')
    setAdjusting(true)
    try {
      await adminApi.adjustTransaction({
        user_id: Number(adjustForm.user_id),
        type: adjustForm.type,
        credits: Number(adjustForm.credits),
        reason: adjustForm.reason,
      })
      setAdjustOpen(false)
      setAdjustForm({ user_id: '', type: 'recharge', credits: '', reason: '' })
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setAdjustError(getApiErrorMessage(err))
    } finally {
      setAdjusting(false)
    }
  }

  async function submitExport() {
    setExporting(true)
    try {
      await adminApi.createExportTask({
        name: `账单对账单 ${exportMonth}`,
        type: 'billing',
        params: { month: exportMonth },
      })
      // 导出任务已创建，提示用户前往数据导出页查看
      alert(`导出任务已提交（${exportMonth}），请前往「数据导出」页面下载。`)
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      alert(getApiErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="账单流水与利润统计"
        description="按时间范围查看平台收入、成本和利润，支持运营复盘与对账。"
        actions={
          <div className="flex items-center gap-2">
            {error ? (
              <Button size="sm" variant="outline" onClick={reload}>
                重试
              </Button>
            ) : null}
            <input
              type="month"
              value={exportMonth}
              onChange={e => setExportMonth(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            />
            <Button size="sm" variant="outline" onClick={submitExport} disabled={exporting}>
              {exporting ? '提交中…' : '导出对账单'}
            </Button>
            <Button size="sm" onClick={() => { setAdjustForm({ user_id: '', type: 'recharge', credits: '', reason: '' }); setAdjustError(''); setAdjustOpen(true) }}>
              手动调账
            </Button>
          </div>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="detail">明细</TabsTrigger>
          <TabsTrigger value="user">按用户</TabsTrigger>
          <TabsTrigger value="channel">按渠道</TabsTrigger>
          <TabsTrigger value="model">按模型</TabsTrigger>
          <TabsTrigger value="day">按日</TabsTrigger>
        </TabsList>

        <TabsContent value="detail">
      {/* 过滤栏 */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">开始时间</label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="w-52" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">结束时间</label>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="w-52" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">类型</label>
            <Select value={txType || '_all'} onValueChange={(v) => setTxType(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="settle">结算</SelectItem>
                <SelectItem value="hold">预扣</SelectItem>
                <SelectItem value="refund">退款</SelectItem>
                <SelectItem value="recharge">充值</SelectItem>
                <SelectItem value="withdraw">提现</SelectItem>
                <SelectItem value="adjust">调整</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">用户 ID</label>
            <Input className="w-28" placeholder="精确" value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          </div>
          <Button onClick={doSearch}>查询</Button>
          <Button variant="outline" onClick={resetSearch}>重置</Button>
        </CardContent>
      </Card>

      {/* 汇总卡片 */}
      {(data.summary.revenue != null || data.summary.cost != null) ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">收入</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">¥{toMoney(data.summary.revenue)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">成本</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">¥{toMoney(data.summary.cost)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">利润</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-blue-600">¥{toMoney(data.summary.profit)}</p></CardContent>
          </Card>
        </div>
      ) : null}

      {/* 流水表格 */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">ID</TableHead>
              <TableHead className="w-16">用户 ID</TableHead>
              <TableHead className="w-20">类型</TableHead>
              <TableHead className="w-36 text-right">金额（CNY）</TableHead>
              <TableHead className="w-32 text-right">成本（CNY）</TableHead>
              <TableHead className="w-32 text-right">利润（CNY）</TableHead>
              <TableHead className="w-16">渠道</TableHead>
              <TableHead>关联 ID</TableHead>
              <TableHead className="w-40">时间</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={9} />
          ) : (
            <TableBody>
              {data.transactions.length === 0 ? (
                <TableEmpty
                  cols={9}
                  Icon={WalletCardsIcon}
                  title="还没有账单记录"
                  description="平台累计的所有积分流水会汇总在此处。"
                />
              ) : (
                data.transactions.map((row, index) => {
                  const amount = row.amount ?? 0
                  const isDebit = ['charge', 'hold', 'settle'].includes(row.type ?? '')
                  const profit = profitOf(row)
                  return (
                    <TableRow key={row.id ?? index}>
                      <TableCell className="text-muted-foreground">{row.id ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{row.user_id ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={txTypeVariant(row.type)} className="text-xs">
                            {txTypeLabel(row.type)}
                          </Badge>
                          {(row.model_credit_charged ?? 0) > 0 && (
                            <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
                              专属积分
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${isDebit ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isDebit ? '-' : '+'}{Math.abs(amount).toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {(row.cost ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${profit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                        {profit.toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.channel_id ?? '-'}</TableCell>
                      <TableCell className="max-w-32 truncate text-xs text-muted-foreground" title={row.corr_id}>
                        {row.llm_log_id ? (
                          <a href={`/admin/llm-logs?id=${row.llm_log_id}`} className="text-blue-600 hover:underline">{row.corr_id}</a>
                        ) : row.task_id ? (
                          <a href={`/admin/tasks?id=${row.task_id}`} className="text-blue-600 hover:underline">{row.corr_id}</a>
                        ) : (row.corr_id ?? '-')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          )}
        </Table>
        {totalPages > 1 ? (
          <CardContent className="flex items-center justify-between border-t py-3">
            <span className="text-sm text-muted-foreground">共 {data.total} 条记录</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => changePage(page - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => changePage(page + 1)}>下一页</Button>
            </div>
          </CardContent>
        ) : null}
      </Card>
        </TabsContent>

        {/* 聚合视图 */}
        {(['user', 'channel', 'model', 'day'] as const).map((dim) => (
          <TabsContent key={dim} value={dim}>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{{ user: '用户 ID', channel: '渠道 ID', model: '模型', day: '日期' }[dim]}</TableHead>
                    <TableHead className="text-right">收入（CNY）</TableHead>
                    <TableHead className="text-right">成本（CNY）</TableHead>
                    <TableHead className="text-right">利润（CNY）</TableHead>
                    <TableHead className="text-right">调用次数</TableHead>
                  </TableRow>
                </TableHeader>
                {aggLoading ? <TableSkeleton cols={5} /> : (
                  <TableBody>
                    {aggData.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">暂无数据</TableCell>
                      </TableRow>
                    ) : aggData.rows.map((row, i) => (
                      <TableRow key={row.key ?? i}>
                        <TableCell className="font-mono text-sm">{row.key}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{toMoney(row.revenue)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{toMoney(row.cost)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${(row.profit ?? 0) >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{toMoney(row.profit)}</TableCell>
                        <TableCell className="text-right text-sm">{row.calls?.toLocaleString('zh-CN') ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* 手动调账 Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手动调账</DialogTitle>
          </DialogHeader>
          {adjustError ? <Alert variant="destructive"><AlertDescription>{adjustError}</AlertDescription></Alert> : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>用户 ID</Label>
              <Input value={adjustForm.user_id} onChange={(e) => setAdjustForm(f => ({ ...f, user_id: e.target.value }))} placeholder="精确用户 ID" />
            </div>
            <div className="space-y-1.5">
              <Label>操作类型</Label>
              <Select value={adjustForm.type} onValueChange={(v) => setAdjustForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recharge">补单（增加余额）</SelectItem>
                  <SelectItem value="adjust">冲销（减少余额）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>金额（CNY，正数）</Label>
              <Input type="number" min="0" step="0.01" value={adjustForm.credits} onChange={(e) => setAdjustForm(f => ({ ...f, credits: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>调账原因（至少 10 字符）</Label>
              <Textarea value={adjustForm.reason} onChange={(e) => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="请详细填写调账原因，便于日后审计" rows={3} />
              <p className="text-xs text-muted-foreground">{adjustForm.reason.length} / 10</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>取消</Button>
            <Button onClick={submitAdjust} disabled={adjusting}>{adjusting ? '提交中…' : '确认调账'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

