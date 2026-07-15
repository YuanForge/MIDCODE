import { useState, type FormEvent } from 'react'
import { BarChart3Icon, SearchIcon } from 'lucide-react'

import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { TokenUsageBarChart } from '@/components/shared/TokenUsageBarChart'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { userApi, type TokenStatsResponse } from '@/lib/api/user'
import { formatTokenCount, tokenStatsTodayRange } from '@/lib/token-usage'

const pageSize = 20

export function UserStatsPage() {
  const [range, setRange] = useState(tokenStatsTodayRange)
  const [modelDraft, setModelDraft] = useState('')
  const [model, setModel] = useState('')
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useAsync(
    () => userApi.getTokenStats({
      start_at: range.startAt,
      end_at: range.endAt,
      model: model || undefined,
      page,
      page_size: pageSize,
    }),
    { items: [], page: 1, page_size: pageSize, total: 0, start_at: '', end_at: '' } as TokenStatsResponse,
    [range.startAt, range.endAt, model, page],
  )

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setModel(modelDraft.trim())
  }

  return (
    <>
      <PageHeader
        eyebrow="Token Usage"
        title="Token 统计"
        description="按精确模型查看输入、缓存与输出 Token。"
        actions={error ? <Button variant="outline" onClick={reload}>重试</Button> : null}
      />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <FilterBar
        filters={
          <>
            <DateRangeFilter
              label="时间"
              startAt={range.startAt}
              endAt={range.endAt}
              onChange={(next) => { setRange(next); setPage(1) }}
            />
            <form className="flex items-end gap-2" onSubmit={search}>
              <Input
                className="w-56"
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                placeholder="搜索精确模型名"
                aria-label="模型名称"
              />
              <Button type="submit">
                <SearchIcon data-icon="inline-start" />查询
              </Button>
            </form>
          </>
        }
      />

      {!loading && data.items.length > 0 ? <TokenUsageBarChart rows={data.items} /> : null}

      <Card className="overflow-hidden">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>模型</TableHead>
              <TableHead className="text-right">非缓存输入</TableHead>
              <TableHead className="text-right">缓存读取</TableHead>
              <TableHead className="text-right">缓存写入</TableHead>
              <TableHead className="text-right">输出</TableHead>
              <TableHead className="text-right">总 Token</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : (
            <TableBody>
              {data.items.length === 0 ? (
                <TableEmpty cols={6} Icon={BarChart3Icon} title="暂无 Token 使用记录" description="当前模型或时间范围内没有成功调用。" />
              ) : data.items.map((row) => (
                <TableRow key={row.model}>
                  <TableCell className="font-mono text-xs">{row.model}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatTokenCount(row.non_cached_input_tokens)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatTokenCount(row.cache_read_tokens)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatTokenCount(row.cache_creation_tokens)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatTokenCount(row.output_tokens)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">{formatTokenCount(row.total_tokens)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        {data.total > 0 ? (
          <TablePagination current={page} total={data.total} pageSize={pageSize} onChange={setPage} className="rounded-none border-x-0 border-b-0" />
        ) : null}
      </Card>
    </>
  )
}
