import { useState } from 'react'
import { PlusIcon, TicketIcon, Trash2Icon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminCoupon } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { CouponUsesDialog, type CouponUse } from '@/pages/admin/coupons/CouponUsesDialog'
import { CreateCouponDialog } from '@/pages/admin/coupons/CreateCouponDialog'
import { initialCouponForm, toCouponPayload, type CouponForm } from '@/pages/admin/coupons/couponForm'

const PAGE_SIZE = 20

function discountLabel(coupon: AdminCoupon) {
  if (coupon.discount_type === 'percent') return `${(coupon.discount_value ?? 0) / 100}% 折扣`
  return `减 ¥${((coupon.discount_value ?? 0) / 100).toFixed(2)}`
}

/** Coupons as a ruled ledger. Creating one, reading its uses and voiding it are dialogs on top of it. */
export function AdminCouponsPage() {
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useAsync(async () => {
    const res = await adminApi.listCoupons({ page, size: PAGE_SIZE })
    return { coupons: res.coupons ?? [], total: res.total ?? 0 }
  }, { coupons: [] as AdminCoupon[], total: 0 }, [page])

  const [voidError, setVoidError] = useState('')
  const [pendingVoidId, setPendingVoidId] = useState<number | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CouponForm>(initialCouponForm)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  const [usesOpen, setUsesOpen] = useState(false)
  const [selected, setSelected] = useState<AdminCoupon | null>(null)
  const [uses, setUses] = useState<CouponUse[]>([])
  const [usesLoading, setUsesLoading] = useState(false)

  function updateField<K extends keyof CouponForm>(key: K, value: CouponForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function openUses(coupon: AdminCoupon) {
    if (!coupon.id) return
    setSelected(coupon)
    setUsesOpen(true)
    setUsesLoading(true)
    try {
      const res = await adminApi.listCouponUses(coupon.id)
      setUses(res.uses ?? [])
    } catch {
      setUses([])
    } finally {
      setUsesLoading(false)
    }
  }

  async function create() {
    setCreating(true)
    setCreateError('')
    try {
      await adminApi.createCoupon(toCouponPayload(form))
      setCreateOpen(false)
      reload()
    } catch (err) {
      setCreateError(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function executeVoid() {
    if (pendingVoidId == null) return
    setVoidError('')
    try {
      await adminApi.voidCoupon(pendingVoidId)
      reload()
    } catch (err) {
      setVoidError(getApiErrorMessage(err))
    } finally {
      setPendingVoidId(null)
    }
  }

  const shownError = error || voidError

  return (
    <>
      <PageHeader
        title='优惠券管理'
        description='创建和管理优惠券，支持固定金额减免和百分比折扣。'
        actions={
          <Button
            onClick={() => {
              setCreateOpen(true)
              setCreateError('')
            }}
          >
            <PlusIcon data-icon='inline-start' />
            创建优惠券
          </Button>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[1040px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>ID</TableHead>
              <TableHead>兑换码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className='w-28 text-right'>优惠</TableHead>
              <TableHead className='w-28 text-right'>最低消费</TableHead>
              <TableHead className='w-24 text-right'>已用/总量</TableHead>
              <TableHead className='w-48'>有效期</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={8} />
          ) : (
            <TableBody>
              {data.coupons.length === 0 ? (
                <TableEmpty cols={8} Icon={TicketIcon} title='暂无优惠券' description='点击右上角创建。' />
              ) : (
                data.coupons.map((coupon) => {
                  const isVoided = coupon.valid_until != null && new Date(coupon.valid_until) < new Date()
                  return (
                    <TableRow key={coupon.id} className={isVoided ? 'opacity-50' : ''}>
                      <TableCell className='tabular-nums'>{coupon.id}</TableCell>
                      <TableCell className='font-mono text-sm'>{coupon.code}</TableCell>
                      <TableCell className='font-medium'>{coupon.title}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {isVoided ? <StatusBadge>已作废</StatusBadge> : discountLabel(coupon)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {coupon.min_amount ? `¥${((coupon.min_amount ?? 0) / 100).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className='text-right text-sm tabular-nums'>
                        {coupon.used_count ?? 0} / {coupon.total_count ?? '∞'}
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {coupon.valid_from ? new Date(coupon.valid_from).toLocaleDateString('zh-CN') : '—'}
                        {' ~ '}
                        {coupon.valid_until ? new Date(coupon.valid_until).toLocaleDateString('zh-CN') : '无限期'}
                      </TableCell>
                      <TableCell className='text-right'>
                        {coupon.id != null ? (
                          <div className='flex justify-end gap-2'>
                            <Button size='sm' variant='outline' onClick={() => void openUses(coupon)}>
                              使用记录
                            </Button>
                            {!isVoided ? (
                              <Button size='sm' variant='outline' className='text-destructive' onClick={() => setPendingVoidId(coupon.id ?? null)}>
                                <Trash2Icon data-icon='inline-start' />
                                作废
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          )}
        </Table>
        {data.total > PAGE_SIZE ? (
          <TablePagination current={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} className='rounded-none border-x-0 border-b-0' />
        ) : null}
      </div>

      <CreateCouponDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        onField={updateField}
        error={createError}
        submitting={creating}
        onSubmit={() => void create()}
      />
      <CouponUsesDialog open={usesOpen} onOpenChange={setUsesOpen} coupon={selected} uses={uses} loading={usesLoading} />
      <ConfirmAction
        open={pendingVoidId != null}
        onClose={() => setPendingVoidId(null)}
        title='确认作废'
        description='确认作废此优惠券吗？作废后持有该优惠码的用户将无法使用，此操作不可撤销。'
        confirmLabel='确认作废'
        onConfirm={() => void executeVoid()}
      />
    </>
  )
}
