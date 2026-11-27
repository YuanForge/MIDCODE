import { useState } from 'react'
import { BanIcon, KeyIcon } from 'lucide-react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TablePagination } from '@/components/shared/TablePagination'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminAPIKey } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

const PAGE_SIZE = 30

/** Every user's API keys as a ruled ledger, searchable by email or user id; an active key can be revoked. */
export function AdminApiKeysPage() {
  const [filterEmail, setFilterEmail] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [page, setPage] = useState(1)

  const { data, loading, error, reload } = useAsync(async () => {
    const params: Record<string, unknown> = { page, size: PAGE_SIZE }
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
      setMutError(getApiErrorMessage(err))
    } finally {
      setPendingRevokeId(null)
    }
  }

  function handleSearch() {
    setPage(1)
    reload()
  }

  function reset() {
    setFilterEmail('')
    setFilterUserId('')
    setPage(1)
  }

  const shownError = error || mutError

  return (
    <>
      <PageHeader title='API Key 总览' description='查看所有用户的 API 密钥，可吊销异常 Key。' />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <FilterBar
        filters={
          <>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='keys-email' className='text-xs text-muted-foreground'>用户邮箱</Label>
              <Input
                id='keys-email'
                className='w-52'
                placeholder='搜索邮箱…'
                value={filterEmail}
                onChange={(event) => setFilterEmail(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='keys-user-id' className='text-xs text-muted-foreground'>用户 ID</Label>
              <Input
                id='keys-user-id'
                className='w-24'
                placeholder='UID'
                value={filterUserId}
                onChange={(event) => setFilterUserId(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
              />
            </div>
          </>
        }
        actions={
          <>
            <Button onClick={handleSearch}>查询</Button>
            <Button variant='outline' onClick={reset}>重置</Button>
          </>
        }
      />

      <div className='glass overflow-hidden'>
        <Table className='min-w-[980px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>ID</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className='w-24'>类型</TableHead>
              <TableHead className='w-24'>状态</TableHead>
              <TableHead className='w-44'>最近使用</TableHead>
              <TableHead className='w-44'>创建时间</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={8} />
          ) : (
            <TableBody>
              {data.keys.length === 0 ? (
                <TableEmpty cols={8} Icon={KeyIcon} title='暂无 API Key' description='条件下无 Key 记录。' />
              ) : (
                data.keys.map((item) => {
                  const id = item.id
                  return (
                    <TableRow key={id}>
                      <TableCell className='tabular-nums'>{id}</TableCell>
                      <TableCell>
                        <div className='text-sm'>{item.user_email}</div>
                        <div className='text-xs text-muted-foreground'>UID {item.user_id}</div>
                      </TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        <Badge variant='outline'>{item.key_type || 'api'}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={item.is_active ? 'success' : 'danger'}>{item.is_active ? '正常' : '已吊销'}</StatusBadge>
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {item.last_used_at ? new Date(item.last_used_at).toLocaleString('zh-CN') : '从未'}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell className='text-right'>
                        {item.is_active && id != null ? (
                          <Button size='sm' variant='outline' className='text-destructive' onClick={() => setPendingRevokeId(id)}>
                            <BanIcon data-icon='inline-start' />
                            吊销
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          )}
        </Table>
        {data.total > 0 ? (
          <TablePagination current={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} className='rounded-none border-x-0 border-b-0' />
        ) : null}
      </div>

      <ConfirmAction
        open={pendingRevokeId != null}
        onClose={() => setPendingRevokeId(null)}
        title='确认吊销'
        description='确认吊销此 API Key 吗？吊销后该 Key 将立即失效，无法撤销。'
        confirmLabel='确认吊销'
        onConfirm={() => void executeRevoke()}
      />
    </>
  )
}
