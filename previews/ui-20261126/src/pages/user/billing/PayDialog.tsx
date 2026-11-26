import { useCallback, useState } from 'react'
import QRCode from 'qrcode'
import { LoaderCircleIcon, WalletIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function PayDialog({
  open,
  onOpenChange,
  payUrl,
  outTradeNo,
  payable,
  methodLabel,
  onClaimPaid,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  payUrl: string
  outTradeNo: string
  payable: number
  methodLabel: string
  onClaimPaid: () => void
}) {
  const [qrError, setQrError] = useState('')

  // A callback ref draws the code as soon as the canvas exists, even though the dialog mounts it inside a portal.
  const drawQr = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !payUrl) return
      setQrError('')
      QRCode.toCanvas(canvas, payUrl, { width: 240, margin: 1 }, (err) => {
        if (err) setQrError('二维码生成失败，请使用下方按钮打开支付页')
      })
    },
    [payUrl],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[min(calc(100vw-2rem),400px)] gap-0 p-0 sm:max-w-none sm:p-0'>
        <DialogHeader className='px-6 pt-6 pb-4'>
          <DialogTitle>扫码支付 ¥{payable.toFixed(2)}</DialogTitle>
          <DialogDescription>请使用{methodLabel}扫码完成支付，到账后此窗口会自动关闭。</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col items-center px-6 pb-6'>
          {payUrl ? (
            <>
              <div className='flex aspect-square w-full max-w-56 items-center justify-center rounded-lg border bg-white p-3'>
                <canvas ref={drawQr} className='max-h-full max-w-full' />
              </div>
              {qrError ? <div className='mt-3 text-xs text-destructive'>{qrError}</div> : null}
              <div className='mt-3 flex items-center gap-2 text-xs text-muted-foreground'>
                <LoaderCircleIcon className='size-3.5 animate-spin' />
                等待支付结果...
              </div>
            </>
          ) : (
            <div className='py-8 text-center text-muted-foreground'>
              <WalletIcon className='mx-auto mb-4 size-10 opacity-50' />
              即将跳转到支付网关...
            </div>
          )}
          <div className='mt-4 flex w-full items-center justify-between gap-2 rounded-xl border border-glass-border bg-glass-strong/60 px-3 py-2 text-xs text-muted-foreground'>
            <span className='truncate'>
              单号 <span className='font-mono text-foreground'>{outTradeNo || '—'}</span>
            </span>
            {payUrl ? (
              <button
                type='button'
                className='shrink-0 font-medium text-brand hover:underline'
                onClick={() => window.open(payUrl, '_blank', 'noopener,noreferrer')}
              >
                在新窗口打开
              </button>
            ) : null}
          </div>
          <p className='mt-2 text-xs text-muted-foreground'>手机上可长按保存或截图后扫码</p>
        </div>
        <DialogFooter className='mx-0! mb-0! grid grid-cols-2 gap-3 sm:mx-0 sm:mb-0'>
          <Button variant='outline' className='w-full' onClick={() => onOpenChange(false)}>
            取消支付
          </Button>
          <Button className='w-full' onClick={onClaimPaid}>
            我已支付
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
