import { useState } from 'react'
import { ReceiptTextIcon, RefreshCcwIcon, SearchIcon } from 'lucide-react'

import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { userApi, type ApiKeyRecord } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'
import { cn } from '@/lib/utils'

type Transaction = {
  id: number | string
  type: string
  credits?: number
  amount?: number
  balance_after?: number | null
  model_credit_charged?: number
  metrics?: { task_id?: number | string }
  created_at?: string
}

const PAGE_SIZE = 20

const TYPE_LABELS: Record<string, string> = {
  recharge: '充值',
  hold: '预扣',
  settle: '结算',
  charge: '扣费',
  refund: '退款',
  consume: '消费',
  invite_rebate: '邀请返利',
}

// Debits: hold, settle, charge, consume. Credits: recharge, refund, invite_rebate.
const DEBIT_TYPES = ['hold', 'settle', 'charge', 'consume']

/** Balance ledger: a bare ruled table under a plain filter row. Spending stays neutral; income is green with its sign. */
export function TransactionsPanel() {
  const [page, setPage] = useState(1)
  const [taskId, setTaskId] = useState('')
  const [corrId, setCorrId] = useState('')
  const [apiKey, setApiKey] = useState('')

  const { data: apiKeys } = useAsync(async () => {
    const response = await userApi.listApiKeys()
    return (Array.isArray(response) ? response : response.api_keys ?? response.keys ?? []) as ApiKeyRecord[]
  }, [] as ApiKeyRecord[])

  const { data, reload } = useAsync(
    async () => {
      const res = await userApi.getTransactions(
        page,
        PAGE_SIZE,
        taskId || undefined,
        corrId || undefined,
        apiKey ? Number(apiKey) : undefined,
      )
      return {
        items: Array.isArray(res) ? res : res.items ?? res.transactions ?? [],
        total: !Array.isArray(res) ? res.total ?? 0 : 0,
      }
    },
    { items: [], total: 0 } as { items: unknown[]; total: number },
    [page, taskId, corrId, apiKey],
  )
  const rows = data.items as Transaction[]

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-wrap items-center gap-2.5'>
          <Input
            className='w-full sm:w-44'
            placeholder='按任务 ID 查询'
            aria-label='任务 ID'
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && setPage(1)}
          />
          <Input
            className='w-full sm:w-52'
            placeholder='按 Corr ID 查询'
            aria-label='Corr ID'
            value={corrId}
            onChange={(event) => setCorrId(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && setPage(1)}
          />
          <NativeSelect
            className='w-full sm:w-44'
            aria-label='API Key'
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value)
              setPage(1)
            }}
          >
            <option value=''>全部 API Key</option>
            {apiKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name || `Key #${key.id}`}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className='flex items-center gap-2'>
          <Button onClick={() => setPage(1)}>
            <SearchIcon data-icon='inline-start' />
            查询
          </Button>
          <Button variant='outline' size='icon' aria-label='刷新流水' title='刷新流水' onClick={() => reload()}>
            <RefreshCcwIcon />
          </Button>
        </div>
      </div>

      <div className='glass overflow-hidden'>
        <Table className='min-w-[760px]'>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead className='text-right'>积分变动</TableHead>
              <TableHead className='text-right'>操作后余额</TableHead>
              <TableHead>关联任务</TableHead>
              <TableHead>时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty
                cols={5}
                Icon={ReceiptTextIcon}
                title='暂无流水记录'
                description='充值、消费、退款和返利都会记录在这里。'
              />
            ) : (
              rows.map((row) => {
                const debit = DEBIT_TYPES.includes(row.type)
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className='flex flex-wrap items-center gap-1'>
                        <Badge variant='outline'>{TYPE_LABELS[row.type] ?? row.type}</Badge>
                        {(row.model_credit_charged ?? 0) > 0 ? <Badge variant='secondary'>专属积分</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-[13px] font-medium',
                        debit ? 'text-foreground' : 'text-success',
                      )}
                    >
                      {debit ? '−' : '+'}
                      {formatCredits(Math.abs(row.credits || row.amount || 0))}
                    </TableCell>
                    <TableCell className='text-right font-mono text-[13px] text-muted-foreground'>
                      {row.balance_after != null ? formatCredits(row.balance_after) : '—'}
                    </TableCell>
                    <TableCell className='font-mono text-xs text-muted-foreground'>
                      {row.metrics?.task_id ? `#${row.metrics.task_id}` : '—'}
                    </TableCell>
                    <TableCell className='text-[13px] text-muted-foreground'>{row.created_at}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      {data.total > 0 ? (
        <TablePagination current={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
      ) : null}
    </div>
  )
}
