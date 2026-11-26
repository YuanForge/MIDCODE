import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import type { VendorPool } from '@/lib/api/vendor'

export type SubmitResult = { ok: boolean; message: string }

/** Upload a new key into a pool. Both validation errors and the server's answer are shown here, where the person is looking. */
export function SubmitKeyDialog({
  open,
  onOpenChange,
  pools,
  poolId,
  onPoolId,
  baseUrl,
  onBaseUrl,
  value,
  onValue,
  result,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pools: VendorPool[]
  poolId: string
  onPoolId: (next: string) => void
  baseUrl: string
  onBaseUrl: (next: string) => void
  value: string
  onValue: (next: string) => void
  result: SubmitResult | null
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>上传新 Key</DialogTitle>
          <DialogDescription>选择号池并填写上游地址和 Key，提交时会先验证再入池。</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='vendor-key-pool'>号池</Label>
            <NativeSelect id='vendor-key-pool' value={poolId} onChange={(event) => onPoolId(event.target.value)}>
              <option value=''>选择号池</option>
              {pools.map((pool) => (
                <option key={pool.id} value={String(pool.id)}>
                  {pool.channel_name}（{pool.name}）
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='vendor-key-base-url'>上游 Base URL</Label>
            <Input
              id='vendor-key-base-url'
              value={baseUrl}
              onChange={(event) => onBaseUrl(event.target.value)}
              placeholder='https://api.example.com/v1/images/generations'
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='vendor-key-value'>API Key</Label>
            <Input id='vendor-key-value' value={value} onChange={(event) => onValue(event.target.value)} placeholder='请输入 API Key' />
          </div>
          {pools.length === 0 ? (
            <p className='text-sm text-muted-foreground'>当前没有开放给号商上传的号池，请先让管理员在后台开启。</p>
          ) : null}
          {result ? (
            <Alert variant={result.ok ? 'default' : 'destructive'}>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={!poolId || !baseUrl.trim() || !value.trim()}>
            验证并提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
