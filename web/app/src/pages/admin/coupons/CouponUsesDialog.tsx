import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminCoupon } from '@/lib/api/admin'

export type CouponUse = { id?: number; coupon_id?: number; user_id?: number; discount?: number; created_at?: string }

/** Who used a coupon, how much it took off, and when. */
export function CouponUsesDialog({
  open,
  onOpenChange,
  coupon,
  uses,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  coupon: AdminCoupon | null
  uses: CouponUse[]
  loading: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{coupon?.code ?? ''} 使用记录</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className='flex flex-col gap-2'>
            <Skeleton className='h-8 w-full' />
            <Skeleton className='h-8 w-full' />
            <Skeleton className='h-8 w-full' />
          </div>
        ) : uses.length === 0 ? (
          <p className='py-4 text-center text-sm text-muted-foreground'>暂无使用记录</p>
        ) : (
          <div className='max-h-[60vh] overflow-y-auto rounded-xl border border-glass-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户 ID</TableHead>
                  <TableHead className='text-right'>优惠金额（¥）</TableHead>
                  <TableHead className='w-40'>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uses.map((use, index) => (
                  <TableRow key={use.id ?? index}>
                    <TableCell className='tabular-nums'>{use.user_id}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>¥{((use.discount ?? 0) / 100).toFixed(2)}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {use.created_at ? new Date(use.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
