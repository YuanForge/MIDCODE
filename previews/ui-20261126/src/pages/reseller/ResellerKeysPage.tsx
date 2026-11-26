import { useState } from 'react'
import { KeySquareIcon, PlusIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableEmpty } from '@/components/shared/TableEmpty'
import { TableSkeleton } from '@/components/shared/TableSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { resellerApi, type ResellerKey, type ResellerModelGroup } from '@/lib/api/reseller'
import { CreateKeyDialog } from '@/pages/reseller/keys/CreateKeyDialog'

const DEFAULT_NAME = '代理站 API Key'

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

/** Reseller keys as a ruled ledger; creating one happens in a dialog on top of it. */
export function ResellerKeysPage() {
  const { data: keys, loading, error: loadError, reload } = useAsync(async () => {
    const response = await resellerApi.getKeys()
    return Array.isArray(response) ? response : response.keys ?? response.items ?? []
  }, [] as ResellerKey[])
  const { data: modelGroups } = useAsync(async () => {
    const response = await resellerApi.listModelGroups()
    return response.groups ?? []
  }, [] as ResellerModelGroup[])

  const [open, setOpen] = useState(false)
  const [name, setName] = useState(DEFAULT_NAME)
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [createdKey, setCreatedKey] = useState('')
  const [mutError, setMutError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setName(DEFAULT_NAME)
      setGroupIds([])
      setCreatedKey('')
      setMutError('')
    }
  }

  function toggleGroup(id: number) {
    setGroupIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function submit() {
    if (!name.trim()) {
      setMutError('请输入 Key 名称')
      return
    }
    if (groupIds.length === 0) {
      setMutError('请至少选择一个模型分组')
      return
    }
    setSubmitting(true)
    setMutError('')
    try {
      const response = await resellerApi.createKey({ name: name.trim(), group_ids: groupIds })
      setCreatedKey(response.key ?? '')
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title='API Key'
        description='代理站必须先绑定代理商 Key，创建代理站后会用它对接主站 API 和同步售价。'
        actions={
          <>
            {loadError ? <Button variant='outline' onClick={reload}>重试</Button> : null}
            <Button onClick={() => setOpen(true)}>
              <PlusIcon data-icon='inline-start' />
              生成 Key
            </Button>
          </>
        }
      />
      {loadError ? (
        <Alert variant='destructive'>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className='glass overflow-hidden'>
        <Table className='min-w-[860px]'>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>路由方式</TableHead>
              <TableHead>Key 前缀</TableHead>
              <TableHead className='text-right'>绑定站点</TableHead>
              <TableHead>最后使用</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton cols={8} />
          ) : (
            <TableBody>
              {keys.length === 0 ? (
                <TableEmpty cols={8} Icon={KeySquareIcon} title='还没有 API Key' description='请先生成 Key，再创建代理站。' />
              ) : (
                keys.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    <TableCell className='tabular-nums'>{row.id ?? '-'}</TableCell>
                    <TableCell>{row.name ?? '-'}</TableCell>
                    <TableCell>模型分组</TableCell>
                    <TableCell className='font-mono text-xs text-muted-foreground'>{row.key_prefix ?? '-'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{row.site_count ?? 0}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{formatTime(row.last_used_at)}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{formatTime(row.created_at)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={row.is_active === false ? 'neutral' : 'success'}>{row.is_active === false ? '停用' : '启用'}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <CreateKeyDialog
        open={open}
        onOpenChange={onOpenChange}
        name={name}
        onName={setName}
        groups={modelGroups}
        groupIds={groupIds}
        onToggle={toggleGroup}
        createdKey={createdKey}
        error={mutError}
        submitting={submitting}
        onSubmit={() => void submit()}
      />
    </>
  )
}
