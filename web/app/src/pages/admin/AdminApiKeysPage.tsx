import { useState } from 'react'
import { BanIcon, KeyIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
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
import { adminApi, type AdminAPIKey } from '@/lib/api/admin'
import { useAsync } from '@/hooks/use-async'

export function AdminApiKeysPage() {
  const [filterEmail, setFilterEmail] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 30

  const { data, loading, error, reload } = useAsync(async () => {
    const params: Record<string, unknown> = { page, size: pageSize }
    if (filterEmail) params.email = filterEmail
    if (filterUserId) params.user_id = filterUserId
    const res = await adminApi.listApiKeys(params)
    return { keys: res.keys ?? [], total: res.total ?? 0 }
  }, { keys: [] as AdminAPIKey[], total: 0 }, [page, filterEmail, filterUserId])

  const [mutError, setMutError] = useState('')
  const [pendingRevokeId, setPendingRevokeId] = useState<number | null>(null)
  async function executeRevoke() {
    if (pendingRevokeId == null) return
    setMutError('')
    try {
      await adminApi.revokeApiKey(pendingRevokeId)
      reload()
    } catch (err) {
      const { getApiErrorMessage } = await import('@/lib/api/http')
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingRevokeId(null)
    }
  }

  function handleSearch() {
    setPage(1)
    reload()
  }

  return (
    <>
      <PageHeader
        eyebrow="API Keys"
        title="API Key 总览"
        description="查看所有用户的 API 密钥，可吊销异常 Key。"
      />
      {error || mutError ? (
        <Alert variant="destructive">
          <AlertDescription>{String(error ?? mutError)}</AlertDescription>
        </Alert>
      ) : null}

      <FilterBar
        filters={
          <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">用户邮箱</label>
            <Input className="w-52" placeholder="搜索邮箱…" value={filterEmail}
              onChange={(e) => setFilterEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">用户 ID</label>
            <Input className="w-24" placeholder="UID" value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
          </div>
          </>
        }
        actions={
          <>
          <Button onClick={handleSearch}>查询</Button>
          <Button variant="outline" onClick={() => { setFilterEmail(''); setFilterUserId(''); setPage(1) }}>重置</Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="w-24">类型</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-40">最近使用</TableHead>
              <TableHead className="w-40">创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton cols={8} /> : (
            <TableBody>
              {data.keys.length === 0 ? (
                <TableEmpty cols={8} Icon={KeyIcon} title="暂无 API Key" description="条件下无 Key 记录。" />
              ) : data.keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>{k.id}</TableCell>
                  <TableCell>
                    <div className="text-sm">{k.user_email}</div>
                    <div className="text-xs text-muted-foreground">UID {k.user_id}</div>
                  </TableCell>
                  <TableCell>{k.name}</TableCell>
                  <TableCell><Badge variant="outline">{k.key_type || 'api'}</Badge></TableCell>
                  <TableCell>
                    {k.is_active
                      ? <Badge className="bg-emerald-600 text-white">正常</Badge>
                      : <Badge variant="destructive">已吊销</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString('zh-CN') : '从未'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {k.created_at ? new Date(k.created_at).toLocaleString('zh-CN') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {k.is_active && k.id != null ? (
                      <Button size="sm" variant="destructive" onClick={() => setPendingRevokeId(k.id!)}>
                        <BanIcon className="mr-1 size-3.5" />吊销
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        {data.total > 0 ? (
          <TablePagination current={page} total={data.total} pageSize={pageSize} onChange={setPage} className="rounded-none border-x-0 border-b-0" />
        ) : null}
      </Card>

      <AlertDialog open={pendingRevokeId != null} onOpenChange={() => setPendingRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认吊销</AlertDialogTitle>
            <AlertDialogDescription>
              确认吊销此 API Key 吗？吊销后该 Key 将立即失效，无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={executeRevoke}>确认吊销</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
