import { useState } from 'react'
import { KeyRoundIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { vendorApi, type VendorKey, type VendorPool } from '@/lib/api/vendor'
import { formatCredits } from '@/lib/formatters/credits'
import { SubmitKeyDialog, type SubmitResult } from '@/pages/vendor/keys/SubmitKeyDialog'

/** The vendor's keys as a ledger of cost and earnings, with upload as a dialog on top of it. */
export function VendorKeysPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [keysRes, poolsRes] = await Promise.all([vendorApi.getKeys(), vendorApi.getPools()])
    return {
      keys: Array.isArray(keysRes) ? keysRes : keysRes.items ?? keysRes.keys ?? [] as VendorKey[],
      pools: Array.isArray(poolsRes) ? poolsRes : poolsRes.pools ?? [] as VendorPool[],
    }
  }, { keys: [] as VendorKey[], pools: [] as VendorPool[] })

  const { keys, pools } = data
  const [open, setOpen] = useState(false)
  const [poolId, setPoolId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [value, setValue] = useState('')
  const [result, setResult] = useState<SubmitResult | null>(null)

  async function submit() {
    const fail = (message: string) => setResult({ ok: false, message })
    if (!poolId) return fail('请选择号池')
    if (!value.trim()) return fail('请输入要提交的 API Key')
    if (!baseUrl.trim()) return fail('请输入上游 Base URL')
    setResult(null)
    try {
      const selected = pools.find((item) => String(item.id) === poolId)
      const response = await vendorApi.submitKey({
        pool_id: selected?.id,
        channel_id: selected?.channel_id,
        base_url: baseUrl.trim(),
        value: value.trim(),
      })
      setResult({ ok: true, message: typeof response?.message === 'string' ? response.message : 'Key 已成功提交到号池' })
      setValue('')
      setBaseUrl('')
      reload()
    } catch (err) {
      fail(getApiErrorMessage(err))
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setPoolId('')
      setBaseUrl('')
      setValue('')
      setResult(null)
    }
  }

  return (
    <>
      <PageHeader
        title='我的 API Key'
        description='上传新 Key，并查看累计消耗与收益。'
        actions={
          <>
            {error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
            <Button onClick={() => setOpen(true)}>上传新 Key</Button>
          </>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[960px]'>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>Key</TableHead>
              <TableHead className='text-right'>累计消耗</TableHead>
              <TableHead className='text-right'>我的收益</TableHead>
              <TableHead>添加时间</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={8} />
          ) : (
            <TableBody>
              {keys.length === 0 ? (
                <TableEmpty cols={8} Icon={KeyRoundIcon} title='暂无 Key 数据' description='点击右上角「上传新 Key」提交第一把 Key。' />
              ) : (
                keys.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                    <TableCell>{row.channel_name ?? row.channel_id ?? '-'}</TableCell>
                    <TableCell className='max-w-[280px] truncate font-mono text-xs text-muted-foreground'>{row.base_url ?? '-'}</TableCell>
                    <TableCell className='font-mono text-xs'>{row.masked_value ?? row.key ?? '-'}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatCredits(row.total_cost ?? 0)}</TableCell>
                    <TableCell className='text-right font-mono text-[13px]'>{formatCredits(row.my_earn ?? row.total_profit ?? 0)}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={row.is_active === false ? 'neutral' : 'success'}>{row.is_active === false ? '禁用' : '启用'}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <SubmitKeyDialog
        open={open}
        onOpenChange={onOpenChange}
        pools={pools}
        poolId={poolId}
        onPoolId={setPoolId}
        baseUrl={baseUrl}
        onBaseUrl={setBaseUrl}
        value={value}
        onValue={setValue}
        result={result}
        onSubmit={() => void submit()}
      />
    </>
  )
}
