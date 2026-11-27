import { useState } from 'react'
import { PencilIcon, PlusIcon, PowerIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAsync } from '@/hooks/use-async'
import {
  adminApi,
  type AdminModelOfficialPrice,
  type AdminModelProvider,
  type ModelOfficialPriceBillingType,
  type ModelOfficialPriceConfig,
  type ModelOfficialPriceCurrency,
  type ModelOfficialPriceInput,
  type USDCNYExchangeRateStatus,
} from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

type Filters = {
  provider: string
  model: string
  billing: string
  status: string
  page: number
}
type PriceForm = {
  id?: number
  provider: string
  model: string
  billing: ModelOfficialPriceBillingType
  currency: ModelOfficialPriceCurrency
  values: Record<string, string>
}

type PendingAction = {
  price: AdminModelOfficialPrice
  kind: 'status' | 'delete'
}

type PriceField = { key: string; label: string; placeholder?: string }

const pageSize = 20
const defaultFilters: Filters = { provider: '', model: '', billing: '', status: '', page: 1 }
const emptyForm: PriceForm = { provider: '', model: '', billing: 'token', currency: 'CNY', values: {} }
const billingLabels: Record<ModelOfficialPriceBillingType, string> = {
  token: 'Token',
  image: '图片',
  video: '视频',
  audio: '音频',
  count: '按次',
}

const tokenFields: PriceField[] = [
  { key: 'input_price_per_1m_tokens', label: '输入价格', placeholder: '每百万 Token' },
  { key: 'output_price_per_1m_tokens', label: '输出价格', placeholder: '每百万 Token' },
  { key: 'cache_creation_price_per_1m_tokens', label: '缓存写入价格', placeholder: '每百万 Token' },
  { key: 'cache_read_price_per_1m_tokens', label: '缓存读取价格', placeholder: '每百万 Token' },
]
const imageFields: PriceField[] = [
  { key: 'base_price', label: '基础价格', placeholder: '每张' },
  { key: 'default_size_price', label: '默认尺寸价格', placeholder: '每张' },
  { key: 'size_prices.1k', label: '1K 价格', placeholder: '每张' },
  { key: 'size_prices.2k', label: '2K 价格', placeholder: '每张' },
  { key: 'size_prices.3k', label: '3K 价格', placeholder: '每张' },
  { key: 'size_prices.4k', label: '4K 价格', placeholder: '每张' },
]

function fieldsForBilling(billing: ModelOfficialPriceBillingType): PriceField[] {
  if (billing === 'token') return tokenFields
  if (billing === 'image') return imageFields
  if (billing === 'count') return [{ key: 'price_per_call', label: '每次价格' }]
  return [{ key: 'price_per_second', label: '每秒价格' }]
}

function formFromPrice(price?: AdminModelOfficialPrice): PriceForm {
  if (!price) return { ...emptyForm, values: {} }
  const values: Record<string, string> = {}
  for (const [key, raw] of Object.entries(price.source_price_config ?? {})) {
    if (key === 'size_prices' && raw && typeof raw === 'object') {
      for (const [size, value] of Object.entries(raw)) values[`size_prices.${size}`] = String(value)
    } else {
      values[key] = String(raw)
    }
  }
  return {
    id: price.id,
    provider: String(price.model_provider_id),
    model: price.model_name,
    billing: price.billing_type,
    currency: price.currency,
    values,
  }
}

function buildSourceConfig(form: PriceForm): ModelOfficialPriceConfig {
  const config: ModelOfficialPriceConfig = {}
  const sizes: Record<string, string> = {}
  for (const field of fieldsForBilling(form.billing)) {
    const value = form.values[field.key]?.trim()
    if (!value) continue
    if (field.key.startsWith('size_prices.')) sizes[field.key.slice('size_prices.'.length)] = value
    else config[field.key] = value
  }
  if (Object.keys(sizes).length > 0) config.size_prices = sizes
  return config
}

function validDecimal(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0
}

function flattenConfig(config?: ModelOfficialPriceConfig, normalized = false) {
  if (!config) return '-'
  const parts: string[] = []
  for (const [key, raw] of Object.entries(config)) {
    if (raw && typeof raw === 'object') {
      for (const [nestedKey, value] of Object.entries(raw)) {
        parts.push(`${nestedKey}: ${normalized ? `¥${(Number(value) / 1_000_000).toFixed(4)}` : value}`)
      }
    } else {
      parts.push(`${key.replace(/_price.*$/, '')}: ${normalized ? `¥${(Number(raw) / 1_000_000).toFixed(4)}` : raw}`)
    }
  }
  return parts.join(' · ') || '-'
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function rateSource(status: USDCNYExchangeRateStatus) {
  return status.source?.toLowerCase() === 'frankfurter' ? 'Frankfurter' : status.source || '-'
}

export function AdminOfficialPricesTab() {
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const { data: providers } = useAsync(async () => {
    const response = await adminApi.listModelProviders(true)
    return response.providers ?? []
  }, [] as AdminModelProvider[])
  const { data, loading, error, reload } = useAsync(async () => {
    const response = await adminApi.listModelOfficialPrices({
      page: filters.page,
      size: pageSize,
      model_provider_id: filters.provider || undefined,
      model_name: filters.model.trim() || undefined,
      billing_type: filters.billing || undefined,
      is_active: filters.status || undefined,
    })
    return {
      prices: response.prices ?? [],
      total: response.total ?? 0,
      exchangeRate: response.exchange_rate ?? {},
    }
  }, { prices: [] as AdminModelOfficialPrice[], total: 0, exchangeRate: {} as USDCNYExchangeRateStatus }, [
    filters.page,
    filters.provider,
    filters.model,
    filters.billing,
    filters.status,
  ])
  const [form, setForm] = useState<PriceForm>(emptyForm)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>()
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)
  const [mutationError, setMutationError] = useState('')

  function openEditor(price?: AdminModelOfficialPrice) {
    setForm(formFromPrice(price))
    setMutationError('')
    setDialogOpen(true)
  }

  function runQuery() {
    setFilters({ ...draftFilters, page: 1 })
  }

  async function save() {
    const config = buildSourceConfig(form)
    const values = fieldsForBilling(form.billing)
      .map((field) => form.values[field.key]?.trim())
      .filter((value): value is string => Boolean(value))
    if (!form.provider || !form.model.trim()) {
      setMutationError('请选择模型厂商并填写标准模型名。')
      return
    }
    if (values.length === 0 || values.some((value) => !validDecimal(value))) {
      setMutationError('至少填写一个大于 0 的十进制价格。')
      return
    }
    if (form.currency === 'USD' && !data.exchangeRate.available) {
      setMutationError('自动 USD/CNY 汇率当前不可用，暂时不能保存 USD 报价。')
      return
    }
    const payload: ModelOfficialPriceInput = {
      model_provider_id: Number(form.provider),
      model_name: form.model.trim(),
      billing_type: form.billing,
      currency: form.currency,
      source_price_config: config,
    }
    setSaving(true)
    setMutationError('')
    try {
      if (form.id) await adminApi.updateModelOfficialPrice(form.id, payload)
      else await adminApi.createModelOfficialPrice(payload)
      setDialogOpen(false)
      toast.success(form.id ? '官方价已更新' : '官方价已创建')
      reload()
    } catch (err) {
      setMutationError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmAction() {
    const action = pendingAction
    if (!action?.price.id) return
    setActing(true)
    setMutationError('')
    try {
      if (action.kind === 'delete') {
        await adminApi.deleteModelOfficialPrice(action.price.id)
        toast.success('官方价已删除')
      } else {
        await adminApi.setModelOfficialPriceStatus(action.price.id, action.price.is_active === false)
        toast.success(action.price.is_active === false ? '官方价已启用' : '官方价已停用')
      }
      setPendingAction(undefined)
      reload()
    } catch (err) {
      setMutationError(getApiErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(data.total / pageSize))
  const activeAction = pendingAction?.price
  const actionIsDelete = pendingAction?.kind === 'delete'

  return (
    <div className="min-w-0">
      <div className="grid gap-px border-b bg-border sm:grid-cols-3">
        <div className="min-w-0 bg-background px-4 py-3">
          <div className="text-xs text-muted-foreground">USD/CNY</div>
          <div className="mt-1 font-mono text-base font-medium">{data.exchangeRate.available ? data.exchangeRate.value : '不可用'}</div>
        </div>
        <div className="min-w-0 bg-background px-4 py-3">
          <div className="text-xs text-muted-foreground">来源 / 日期</div>
          <div className="mt-1 truncate text-sm font-medium">{rateSource(data.exchangeRate)} · {data.exchangeRate.date || '-'}</div>
        </div>
        <div className="min-w-0 bg-background px-4 py-3">
          <div className="text-xs text-muted-foreground">最近同步</div>
          <div className="mt-1 truncate text-sm font-medium">{formatTime(data.exchangeRate.synced_at)}</div>
          {data.exchangeRate.last_error ? <div className="mt-1 truncate text-xs text-destructive" title={data.exchangeRate.last_error}>{data.exchangeRate.last_error}</div> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="official-filter-provider">模型厂商</Label>
            <NativeSelect id="official-filter-provider" value={draftFilters.provider} onChange={(event) => setDraftFilters((current) => ({ ...current, provider: event.target.value }))}>
              <option value="">全部厂商</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-filter-model">模型名称筛选</Label>
            <Input id="official-filter-model" value={draftFilters.model} onChange={(event) => setDraftFilters((current) => ({ ...current, model: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') runQuery() }} placeholder="精确名称或关键字" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-filter-billing">计费类型</Label>
            <NativeSelect id="official-filter-billing" value={draftFilters.billing} onChange={(event) => setDraftFilters((current) => ({ ...current, billing: event.target.value }))}>
              <option value="">全部类型</option>
              {Object.entries(billingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-filter-status">状态</Label>
            <NativeSelect id="official-filter-status" value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">全部状态</option>
              <option value="true">启用</option>
              <option value="false">停用</option>
            </NativeSelect>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={runQuery}><SearchIcon data-icon="inline-start" />查询</Button>
          <Button onClick={() => openEditor()}><PlusIcon data-icon="inline-start" />新增官方价</Button>
        </div>
      </div>

      {error || mutationError ? <Alert variant="destructive" className="m-4"><AlertDescription>{error || mutationError}</AlertDescription></Alert> : null}

      <div className="max-w-full overflow-x-auto">
        <TooltipProvider>
          <Table className="min-w-[1040px]">
            <TableHeader>
              <TableRow>
                <TableHead>厂商 / 模型</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>币种</TableHead>
                <TableHead className="min-w-64">原始报价</TableHead>
                <TableHead className="min-w-64">积分报价</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? <TableSkeleton cols={8} /> : (
              <TableBody>
                {data.prices.map((price) => (
                  <TableRow key={price.id}>
                    <TableCell><div className="font-medium">{price.model_provider_name || price.model_provider_code || `#${price.model_provider_id}`}</div><div className="font-mono text-xs text-muted-foreground">{price.model_name}</div></TableCell>
                    <TableCell>{billingLabels[price.billing_type]}</TableCell>
                    <TableCell><Badge variant="outline">{price.currency}</Badge></TableCell>
                    <TableCell className="max-w-72 truncate font-mono text-xs" title={flattenConfig(price.source_price_config)}>{flattenConfig(price.source_price_config)}</TableCell>
                    <TableCell className="max-w-72 truncate font-mono text-xs" title={flattenConfig(price.normalized_price_config, true)}>{flattenConfig(price.normalized_price_config, true)}</TableCell>
                    <TableCell><Badge variant={price.is_active === false ? 'secondary' : 'default'}>{price.is_active === false ? '停用' : '启用'}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(price.updated_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`编辑 ${price.model_name}`} onClick={() => openEditor(price)}><PencilIcon /></Button></TooltipTrigger><TooltipContent>编辑</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`${price.is_active === false ? '启用' : '停用'} ${price.model_name}`} onClick={() => setPendingAction({ price, kind: 'status' })}><PowerIcon /></Button></TooltipTrigger><TooltipContent>{price.is_active === false ? '启用' : '停用'}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`删除 ${price.model_name}`} onClick={() => setPendingAction({ price, kind: 'delete' })}><Trash2Icon /></Button></TooltipTrigger><TooltipContent>删除</TooltipContent></Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.prices.length === 0 ? <TableEmpty cols={8} title="暂无补充官方价" /> : null}
              </TableBody>
            )}
          </Table>
        </TooltipProvider>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">共 {data.total} 条</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={filters.page <= 1} onClick={() => { const page = filters.page - 1; setFilters((current) => ({ ...current, page })); setDraftFilters((current) => ({ ...current, page })) }}>上一页</Button>
          <span className="tabular-nums">{filters.page} / {pageCount}</span>
          <Button size="sm" variant="outline" disabled={filters.page >= pageCount} onClick={() => { const page = filters.page + 1; setFilters((current) => ({ ...current, page })); setDraftFilters((current) => ({ ...current, page })) }}>下一页</Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open) }}>
        <DialogContent className="flex max-h-[86vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>{form.id ? '编辑官方价' : '新增官方价'}</DialogTitle>
            <DialogDescription>原始报价将按当前自动汇率标准化为内部积分。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="official-provider">模型厂商</Label>
                <NativeSelect id="official-provider" value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}>
                  <option value="">请选择</option>
                  {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={provider.is_active === false}>{provider.name}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="official-model">标准模型名</Label>
                <Input id="official-model" value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="需与渠道 model 完全一致" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="official-billing">计费类型</Label>
                <NativeSelect id="official-billing" value={form.billing} onChange={(event) => setForm((current) => ({ ...current, billing: event.target.value as ModelOfficialPriceBillingType, values: {} }))}>
                  {Object.entries(billingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="official-currency">币种</Label>
                <NativeSelect id="official-currency" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value as ModelOfficialPriceCurrency }))}>
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fieldsForBilling(form.billing).map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`official-${field.key}`}>{field.label}</Label>
                  <Input id={`official-${field.key}`} inputMode="decimal" value={form.values[field.key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, values: { ...current.values, [field.key]: event.target.value } }))} placeholder={field.placeholder || `每${form.billing === 'count' ? '次' : '秒'}`} />
                </div>
              ))}
            </div>
            {mutationError ? <Alert variant="destructive"><AlertDescription>{mutationError}</AlertDescription></Alert> : null}
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none p-4">
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open && !acting) setPendingAction(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionIsDelete ? '删除官方价' : activeAction?.is_active === false ? '启用官方价' : '停用官方价'}</AlertDialogTitle>
            <AlertDialogDescription>
              {actionIsDelete
                ? `确认删除“${activeAction?.model_name ?? ''}”的补充官方价？此操作不可恢复。`
                : `确认${activeAction?.is_active === false ? '启用' : '停用'}“${activeAction?.model_name ?? ''}”的补充官方价？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={acting} onClick={(event) => { event.preventDefault(); void confirmAction() }}>{acting ? '处理中...' : actionIsDelete ? '确认删除' : '确认'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
