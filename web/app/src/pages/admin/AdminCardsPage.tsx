import { useState } from 'react'
import { CreditCardIcon, RefreshCwIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { copyToClipboard } from '@/lib/clipboard'
import { adminApi, type AdminCard, type AdminCardBatch, type AdminVendor } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

type TabView = 'batches' | 'cards' | 'uses'

export function AdminCardsPage() {
  const [tab, setTab] = useState<TabView>('batches')
  const [statusFilter, setStatusFilter] = useState('')
  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({})

  const { data: batchRows, loading: batchLoading, reload: reloadBatches } = useAsync(async () => {
    const res = await adminApi.listCardBatches()
    return res.batches ?? []
  }, [] as AdminCardBatch[], [])

  const { data: rows, loading, error: loadError, reload } = useAsync(async () => {
    const response = await adminApi.listCards(queryParams)
    return response.cards ?? []
  }, [] as AdminCard[], [queryParams])

  const { data: usedRows, loading: usedLoading } = useAsync(async () => {
    const response = await adminApi.listCards({ status: 'used', limit: 500 })
    return response.cards ?? []
  }, [] as AdminCard[], [tab === 'uses' ? 1 : 0])

  const [mutError, setMutError] = useState('')
  const [exportingUnused, setExportingUnused] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportBatchId, setExportBatchId] = useState('__all__')
  const [exportPassword, setExportPassword] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [generatedCards, setGeneratedCards] = useState<AdminCard[]>([])
  const [count, setCount] = useState('10')
  const [amount, setAmount] = useState('10')
  const [note, setNote] = useState('')
  const [vendorId, setVendorId] = useState<string>('')
  const [pendingDeleteCard, setPendingDeleteCard] = useState<AdminCard | undefined>()

  const { data: vendors } = useAsync(async () => {
    const res = await adminApi.listVendors({})
    return (Array.isArray(res) ? res : (res as { vendors?: AdminVendor[]; items?: AdminVendor[] }).vendors ?? (res as { items?: AdminVendor[] }).items ?? []) as AdminVendor[]
  }, [] as AdminVendor[], [])

  const error = loadError || mutError

  async function generateCards() {
    setMutError('')
    try {
      const response = await adminApi.generateCards({
        count: Number(count),
        credits: Math.round(Number(amount) * 1_000_000),
        note,
        vendor_id: vendorId ? Number(vendorId) : null,
      })
      setGeneratedCards(response.cards ?? [])
      setGenerateOpen(false)
      setResultOpen(true)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function handleVoidCard(id: number) {
    setMutError('')
    try {
      await adminApi.voidCard(id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function handleVoidBatch(batchId: string) {
    setMutError('')
    try {
      const res = await adminApi.voidCardBatch(batchId)
      const voided = (res as { voided?: number }).voided ?? 0
      window.alert(`已作废 ${voided} 张未使用卡密`)
      reloadBatches()
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    }
  }

  async function executeDeleteCard() {
    if (!pendingDeleteCard?.id) return
    setMutError('')
    try {
      await adminApi.deleteCard(pendingDeleteCard.id)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingDeleteCard(undefined)
    }
  }

  async function exportUnusedCards() {
    setExportingUnused(true)
    setMutError('')
    try {
      // Verify password first
      await adminApi.verifyAdminPassword(exportPassword)
      const params: Record<string, unknown> = { status: 'unused', limit: 10000 }
      if (exportBatchId && exportBatchId !== '__all__') {
        params.batch_id = exportBatchId
      }
      const response = await adminApi.listCards(params)
      const cards = response.cards ?? []
      const lines = ['兑换码,面值(元),批次号,备注,生成时间', ...cards.map(c =>
        `${c.code},${((c.credits ?? 0) / 1_000_000).toFixed(4)},${c.batch_id ?? ''},${c.note ?? ''},${c.created_at ? new Date(c.created_at).toLocaleString('zh-CN') : ''}`
      )]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `unused_cards_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setExportDialogOpen(false)
      setExportPassword('')
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    } finally {
      setExportingUnused(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Cards"
        title="卡密管理"
        description="批量生成、作废卡密，按批次或明细查看。"
        actions={
          <>
            {error ? (
              <Button size="sm" variant="outline" onClick={reload}>
                重试
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => { setExportDialogOpen(true); setExportPassword(''); setMutError('') }} disabled={exportingUnused}>
              导出未用卡密
            </Button>
            <Button onClick={() => setGenerateOpen(true)}>生成卡密</Button>
          </>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button size="sm" variant={tab === 'batches' ? 'default' : 'outline'} onClick={() => setTab('batches')}>批次管理</Button>
        <Button size="sm" variant={tab === 'cards' ? 'default' : 'outline'} onClick={() => setTab('cards')}>卡密列表</Button>
        <Button size="sm" variant={tab === 'uses' ? 'default' : 'outline'} onClick={() => setTab('uses')}>使用记录</Button>
      </div>

      {tab === 'batches' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次 ID</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-28">面值（¥）</TableHead>
                <TableHead className="w-20 text-right">总数</TableHead>
                <TableHead className="w-20 text-right">已用</TableHead>
                <TableHead className="w-40">生成时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            {batchLoading ? <TableSkeleton cols={7} /> : (
              <TableBody>
                {batchRows.length === 0 ? (
                  <TableEmpty cols={7} Icon={CreditCardIcon} title="暂无批次" description="生成卡密后批次会显示在这里。" />
                ) : batchRows.map((row) => (
                  <TableRow key={row.id ?? row.batch_id}>
                    <TableCell className="font-mono text-xs">{row.batch_id}</TableCell>
                    <TableCell>{row.note || '-'}</TableCell>
                    <TableCell className="font-mono">¥{((row.credits ?? 0) / 1e6).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right text-emerald-600">{row.used ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="destructive" onClick={() => row.batch_id && handleVoidBatch(row.batch_id)}>
                        整批作废未用
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      ) : null}

      {tab === 'cards' ? <>
      <Card>
        <CardContent className="flex items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">状态过滤</label>
            <Select value={statusFilter || '_all'} onValueChange={(v) => setStatusFilter(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="unused">未使用</SelectItem>
                <SelectItem value="used">已使用</SelectItem>
                <SelectItem value="voided">已作废</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setQueryParams(statusFilter ? { status: statusFilter } : {})}>查询</Button>
          <Button variant="outline" onClick={() => { setStatusFilter(''); setQueryParams({}) }}>重置</Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>兑换码</TableHead>
              <TableHead>面值</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>生成时间</TableHead>
              <TableHead>使用时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : (
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty
                  cols={7}
                  Icon={CreditCardIcon}
                  title="还没有卡密"
                  description="使用上方「批量生成」创建卡密后会显示在这里。"
                />
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell
                      className="font-mono text-xs cursor-pointer hover:text-primary"
                      onClick={() => {
                        void copyToClipboard(row.code ?? '', { successMessage: '兑换码已复制' })
                      }}
                      title="点击复制"
                    >{row.code ?? '-'}</TableCell>
                    <TableCell>¥{((row.credits ?? 0) / 1_000_000).toFixed(4)}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'unused' ? 'default' : 'secondary'}>
                        {row.status === 'unused' ? '未使用' : '已使用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.note ?? '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.used_at ? new Date(row.used_at).toLocaleString('zh-CN') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === 'unused' && row.id != null ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="destructive" onClick={() => handleVoidCard(row.id!)}>
                            作废
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPendingDeleteCard(row)}>
                            删除
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </Card>
      </> : null}

      {tab === 'uses' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>兑换码</TableHead>
                <TableHead>面值</TableHead>
                <TableHead>兑换用户 ID</TableHead>
                <TableHead>兑换时间</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            {usedLoading ? <TableSkeleton cols={5} /> : (
              <TableBody>
                {usedRows.length === 0 ? (
                  <TableEmpty cols={5} Icon={CreditCardIcon} title="暂无兑换记录" description="有用户兑换卡密后将显示在此。" />
                ) : usedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.code ?? '-'}</TableCell>
                    <TableCell>¥{((row.credits ?? 0) / 1_000_000).toFixed(4)}</TableCell>
                    <TableCell className="text-muted-foreground">{row.used_by ? `#${row.used_by}` : '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.used_at ? new Date(row.used_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.note ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      ) : null}

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量生成卡密</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Input value={count} onChange={(event) => setCount(event.target.value)} placeholder="数量" />
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="面值（元）" />
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注" />
            <div className="space-y-1.5">
              <Label>来源分销（可选）</Label>
              <Select value={vendorId || '__none__'} onValueChange={(v) => setVendorId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="不绑定分销" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不绑定分销</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      #{v.id} {v.username ?? v.name ?? ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>取消</Button>
            <Button onClick={generateCards}>生成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成结果</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-auto rounded-xl border border-border/70 bg-muted/25 p-4 font-mono text-xs">
            {generatedCards.map((card) => `${card.code} ${(card.credits ?? 0) / 1_000_000}元`).join('\n')}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultOpen(false)}>关闭</Button>
            <Button
              onClick={() => {
                void copyToClipboard(
                  generatedCards
                    .map((card) => `${card.code} ${(card.credits ?? 0) / 1_000_000}元`)
                    .join('\n'),
                  { successMessage: '卡密列表已复制' }
                )
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              复制全部
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteCard !== undefined} onOpenChange={() => setPendingDeleteCard(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除卡密 {pendingDeleteCard?.code ?? pendingDeleteCard?.id} 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteCard}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导出未用卡密 dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={(o) => { if (!o) { setExportDialogOpen(false); setMutError('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出未用卡密</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>按批次筛选</Label>
              <Select value={exportBatchId} onValueChange={setExportBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="所有批次" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">所有批次</SelectItem>
                  {batchRows.map((b) => (
                    <SelectItem key={b.batch_id} value={b.batch_id ?? ''}>
                      {b.batch_id} {b.note ? `— ${b.note}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>操作人密码（二次确认）</Label>
              <Input
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="请输入您的登录密码"
                onKeyDown={(e) => e.key === 'Enter' && exportUnusedCards()}
              />
            </div>
            {mutError ? <p className="text-sm text-destructive">{mutError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>取消</Button>
            <Button onClick={exportUnusedCards} disabled={exportingUnused || !exportPassword}>
              {exportingUnused ? '导出中…' : '确认导出'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
