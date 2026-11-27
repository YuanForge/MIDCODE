import { useCallback, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { useMediaQuery } from '@/hooks/use-media-query'
import { adminApi, type AdminUser, type AdminVIPGroup } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { useReportRows } from '@/lib/console-status'
import { runBatch, type ActionMode, type EditMode } from '@/pages/admin/users/actions'
import { BatchBar } from '@/pages/admin/users/BatchBar'
import { BatchDialog } from '@/pages/admin/users/BatchDialog'
import { CreateUserDialog } from '@/pages/admin/users/CreateUserDialog'
import { UserActionDialog } from '@/pages/admin/users/UserActionDialog'
import { UserDetailDialog } from '@/pages/admin/users/UserDetailDialog'
import { UserDetailPanel } from '@/pages/admin/users/UserDetailPanel'
import { UserFilters } from '@/pages/admin/users/UserFilters'
import { UsersTable } from '@/pages/admin/users/UsersTable'
import { PAGE_SIZE, activeVipChoices, buildUserParams, emptyFilters, type UserFilterState } from '@/pages/admin/users/userFormat'

/** The ticks that are still on the page. The same set comes back when none was dropped, so nothing re-renders for it. */
function keepShown(ticked: Set<number>, ids: number[]) {
  const shown = new Set(ids)
  const kept = Array.from(ticked).filter((id) => shown.has(id))
  return kept.length === ticked.size ? ticked : new Set(kept)
}

/** The open account as the list has it now, or nothing once its row is gone. */
function freshRow(open: AdminUser | null, users: AdminUser[]) {
  if (open?.id == null) return open
  return users.find((user) => user.id === open.id) ?? null
}

/**
 * Users as a ruled ledger. An account opens beside the table where the window is wide enough for both, and in a
 * dialog where it is not. Everything done to an account is a dialog on top, and each dialog keeps its own errors.
 */
export function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<UserFilterState>(emptyFilters)
  const [query, setQuery] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const response = await adminApi.listUsers(page, PAGE_SIZE, query)
    const users = Array.isArray(response) ? response : response.users ?? response.items ?? []
    const total = Array.isArray(response) ? users.length : (response as { total?: number }).total ?? users.length
    return { users, total }
  }, { users: [] as AdminUser[], total: 0 }, [page, query])

  const { data: vipGroups } = useAsync(async () => {
    const res = await adminApi.listVipGroups(true)
    return res.groups ?? []
  }, [] as AdminVIPGroup[])
  const vipChoices = activeVipChoices(vipGroups)

  const [pageError, setPageError] = useState('')
  const [detail, setDetail] = useState<AdminUser | null>(null)
  const [detailError, setDetailError] = useState('')
  const [action, setAction] = useState<{ mode: EditMode; user: AdminUser } | null>(null)
  const [creating, setCreating] = useState(false)
  const [batch, setBatch] = useState<'freeze' | 'group' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null)
  const [confirmUnfreezeAll, setConfirmUnfreezeAll] = useState(false)

  useReportRows(data.users.length, loading)
  const error = loadError || pageError
  const ids = data.users.map((user) => user.id).filter((id): id is number => id != null)
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))

  // The ticks and the open account belong to the rows on screen. When the list changes under them (an action
  // reloads it, a row stops matching the filter), a tick whose row is gone is dropped, so a batch action cannot
  // reach an account that is not shown, and the open account takes its fresh row or closes with it.
  const [listed, setListed] = useState(data.users)
  if (listed !== data.users) {
    setListed(data.users)
    setSelected((current) => keepShown(current, ids))
    setDetail((current) => freshRow(current, data.users))
  }

  // Beside the table from 1536px, where both fit; below that the dialog, as before.
  const wide = useMediaQuery('(min-width: 1536px)')
  const panelUser = wide ? detail : null
  const closeDetail = useCallback(() => setDetail(null), [])

  function field<K extends keyof UserFilterState>(key: K, next: UserFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: next }))
  }

  // A new search or page means the ticked rows are no longer on screen, so the ticks go.
  function search(params: Record<string, string>) {
    setSelected(new Set())
    setPage(1)
    setQuery(params)
  }

  function goPage(next: number) {
    setSelected(new Set())
    setPage(next)
  }

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openDetail(user: AdminUser) {
    setDetailError('')
    setDetail(user)
  }

  function openAction(mode: ActionMode, user: AdminUser) {
    if (mode === 'delete') {
      setPendingDelete(user)
      return
    }
    setAction({ mode, user })
  }

  function actionDone() {
    setAction(null)
    setDetail(null)
    reload()
  }

  async function unfreeze(user: AdminUser, fromDetail: boolean) {
    if (user.id == null) return
    const fail = fromDetail ? setDetailError : setPageError
    fail('')
    try {
      await adminApi.freezeUser(user.id, false)
      toast.success('已解除冻结')
      if (fromDetail) setDetail(null)
      reload()
    } catch (err) {
      fail(getApiErrorMessage(err))
    }
  }

  async function refreshVip(user: AdminUser) {
    if (user.id == null) return
    setDetailError('')
    try {
      await adminApi.refreshUserVipGroup(user.id)
      toast.success('已按累计充值重新计算 VIP 等级')
      setDetail(null)
      reload()
    } catch (err) {
      setDetailError(getApiErrorMessage(err))
    }
  }

  async function executeDelete() {
    const id = pendingDelete?.id
    if (id == null) return
    setDetailError('')
    try {
      await adminApi.deleteUser(id)
      toast.success('用户已删除')
      setDetail(null)
      reload()
    } catch (err) {
      setDetailError(getApiErrorMessage(err))
    }
  }

  async function executeUnfreezeAll() {
    setPageError('')
    try {
      await runBatch('unfreeze', Array.from(selected))
      setSelected(new Set())
      reload()
    } catch (err) {
      setPageError(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title='用户与余额管理'
        description='查看用户注册状态、余额和手动充值情况，用于日常运营支持。'
        actions={
          <div className='flex items-center gap-2'>
            {loadError ? (
              <Button variant='outline' onClick={reload}>
                重试
              </Button>
            ) : null}
            <Button onClick={() => setCreating(true)}>
              <PlusIcon data-icon='inline-start' />
              创建用户
            </Button>
          </div>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <UserFilters
        value={filters}
        onField={field}
        onSearch={() => search(buildUserParams(filters))}
        onReset={() => {
          setFilters(emptyFilters)
          search({})
        }}
      />

      {selected.size > 0 ? (
        <BatchBar
          count={selected.size}
          onFreeze={() => setBatch('freeze')}
          onGroup={() => setBatch('group')}
          onUnfreeze={() => setConfirmUnfreezeAll(true)}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      {/* The wrapper is always here, so the table keeps its place (and focus) when the panel opens and closes. */}
      <div className={panelUser ? 'grid gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem] 2xl:items-start' : undefined}>
        <UsersTable
          rows={data.users}
          loading={loading}
          page={page}
          total={data.total}
          onPage={goPage}
          selected={selected}
          allSelected={allSelected}
          onToggle={toggle}
          onToggleAll={() => setSelected(allSelected ? new Set() : new Set(ids))}
          onDetail={openDetail}
          onFreeze={(user) => openAction('freeze', user)}
          onUnfreeze={(user) => void unfreeze(user, false)}
          openId={panelUser?.id}
          compact={panelUser != null}
        />
        {panelUser ? (
          <UserDetailPanel
            user={panelUser}
            error={detailError}
            onClose={closeDetail}
            onAction={(mode) => openAction(mode, panelUser)}
            onUnfreeze={() => void unfreeze(panelUser, true)}
            onRefreshVip={() => void refreshVip(panelUser)}
          />
        ) : null}
      </div>

      <UserDetailDialog
        user={wide ? null : detail}
        error={detailError}
        onClose={closeDetail}
        onAction={(mode) => detail && openAction(mode, detail)}
        onUnfreeze={() => detail && void unfreeze(detail, true)}
        onRefreshVip={() => detail && void refreshVip(detail)}
      />

      {creating ? (
        <CreateUserDialog
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            reload()
          }}
        />
      ) : null}
      {action ? <UserActionDialog key={`${action.mode}-${action.user.id}`} mode={action.mode} user={action.user} vipChoices={vipChoices} onClose={() => setAction(null)} onDone={actionDone} /> : null}
      {batch ? (
        <BatchDialog
          kind={batch}
          ids={Array.from(selected)}
          vipChoices={vipChoices}
          onClose={() => setBatch(null)}
          onDone={() => {
            setBatch(null)
            setSelected(new Set())
            reload()
          }}
        />
      ) : null}

      <ConfirmAction
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title='删除用户'
        description={
          <>
            确定要永久删除用户 <strong>{pendingDelete?.username}</strong> 吗？此操作不可恢复，用户的所有 API Key 将同时被删除。
          </>
        }
        confirmLabel='确认删除'
        onConfirm={() => void executeDelete()}
      />
      <ConfirmAction
        open={confirmUnfreezeAll}
        onClose={() => setConfirmUnfreezeAll(false)}
        title='批量解封'
        description={`将解除已选 ${selected.size} 个用户的冻结状态。`}
        confirmLabel='确认解封'
        onConfirm={() => void executeUnfreezeAll()}
      />
    </>
  )
}
