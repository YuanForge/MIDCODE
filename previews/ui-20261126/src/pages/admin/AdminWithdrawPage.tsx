import { useEffect, useRef, useState } from 'react'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { FilterBar } from '@/components/shared/FilterBar'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminWithdrawal } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { ProofDialog } from '@/pages/admin/withdraw/ProofDialog'
import { RejectDialog } from '@/pages/admin/withdraw/RejectDialog'
import { ProofViewDialog, QrDialog } from '@/pages/admin/withdraw/ViewDialogs'
import { WithdrawTable } from '@/pages/admin/withdraw/WithdrawTable'
import { PAGE_SIZE } from '@/pages/admin/withdraw/format'

/** Two-stage withdrawal review: customer service first, finance second, then the transfer proof. */
export function AdminWithdrawPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [queryParams, setQueryParams] = useState({ page: 1, size: PAGE_SIZE, status: '' })

  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const [listRes, countRes] = await Promise.all([
      adminApi.listWithdrawals(queryParams),
      adminApi.getPendingWithdrawCount(),
    ])
    const records: AdminWithdrawal[] = (listRes as { records?: AdminWithdrawal[] }).records ?? (Array.isArray(listRes) ? listRes : [])
    const total: number = (listRes as { total?: number }).total ?? records.length
    return { rows: records, total, pendingCount: countRes.count ?? 0 }
  }, { rows: [] as AdminWithdrawal[], total: 0, pendingCount: 0 }, [queryParams])

  // Keep the pending count fresh while the page is open.
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  }, [reload])
  useEffect(() => {
    const timer = setInterval(() => reloadRef.current(), 30_000)
    return () => clearInterval(timer)
  }, [])

  const [mutError, setMutError] = useState('')
  const [viewRow, setViewRow] = useState<AdminWithdrawal | null>(null)
  const [viewProofRow, setViewProofRow] = useState<AdminWithdrawal | null>(null)
  const [pendingApprove, setPendingApprove] = useState<AdminWithdrawal | null>(null)
  const [pendingCsApprove, setPendingCsApprove] = useState<AdminWithdrawal | null>(null)
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null)
  const [remark, setRemark] = useState('')
  const [rejectError, setRejectError] = useState('')
  const [proofRow, setProofRow] = useState<AdminWithdrawal | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const [proofNote, setProofNote] = useState('')
  const [proofUploading, setProofUploading] = useState(false)
  const [proofError, setProofError] = useState('')

  const error = loadError || mutError

  function doFilter() {
    setPage(1)
    setQueryParams({ page: 1, size: PAGE_SIZE, status: statusFilter })
  }

  function changePage(next: number) {
    setPage(next)
    setQueryParams((prev) => ({ ...prev, page: next }))
  }

  function openReject(row: AdminWithdrawal) {
    setRejecting(row)
    setRemark('')
    setRejectError('')
  }

  async function executeCsApprove() {
    if (!pendingCsApprove?.id) return
    setMutError('')
    try {
      await adminApi.csApproveWithdrawal(pendingCsApprove.id)
      setPendingCsApprove(null)
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  async function executeApprove(row?: AdminWithdrawal) {
    const target = row ?? pendingApprove
    if (!target?.id) return
    setMutError('')
    try {
      await adminApi.approveWithdrawal(target.id)
      setViewRow(null)
      setPendingApprove(null)
      setProofRow(target)
      setProofUrl('')
      setProofNote('')
      setProofError('')
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  async function submitProof() {
    if (!proofRow?.id) return
    setProofError('')
    setProofUploading(true)
    try {
      await adminApi.uploadWithdrawalProof(proofRow.id, proofUrl, proofNote)
      setProofRow(null)
      reload()
    } catch (err) {
      setProofError(getApiErrorMessage(err))
    } finally {
      setProofUploading(false)
    }
  }

  async function reject() {
    if (!rejecting?.id) return
    setRejectError('')
    try {
      await adminApi.rejectWithdrawal(rejecting.id, remark)
      setRejecting(null)
      setRemark('')
      reload()
    } catch (err) {
      setRejectError(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title='提现审核'
        description={`当前待处理 ${data.pendingCount} 条提现申请。`}
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FilterBar
        filters={
          <div className='flex flex-col gap-1'>
            <Label htmlFor='withdraw-status' className='text-xs text-muted-foreground'>状态</Label>
            <Select value={statusFilter || '_all'} onValueChange={(value) => setStatusFilter(value === '_all' ? '' : value)}>
              <SelectTrigger id='withdraw-status' className='w-32'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='_all'>全部</SelectItem>
                <SelectItem value='pending'>待审核</SelectItem>
                <SelectItem value='approved'>已通过</SelectItem>
                <SelectItem value='rejected'>已拒绝</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        actions={<Button onClick={doFilter}>查询</Button>}
      />

      <WithdrawTable
        rows={data.rows}
        loading={loading}
        page={page}
        total={data.total}
        onPage={changePage}
        handlers={{
          onQr: setViewRow,
          onProof: setViewProofRow,
          onCsApprove: setPendingCsApprove,
          onApprove: setPendingApprove,
          onReject: openReject,
        }}
      />

      <QrDialog
        row={viewRow}
        onClose={() => setViewRow(null)}
        onViewProof={(row) => {
          setViewProofRow(row)
          setViewRow(null)
        }}
        onCsApprove={(row) => {
          setPendingCsApprove(row)
          setViewRow(null)
        }}
        onApprove={(row) => void executeApprove(row)}
      />
      <ProofViewDialog row={viewProofRow} onClose={() => setViewProofRow(null)} />
      <RejectDialog row={rejecting} remark={remark} onRemark={setRemark} error={rejectError} onClose={() => setRejecting(null)} onConfirm={() => void reject()} />
      <ConfirmAction
        open={pendingApprove !== null}
        onClose={() => setPendingApprove(null)}
        title='确认通过'
        description={`确认通过 ${pendingApprove?.username ?? ''} 的提现申请吗？`}
        confirmLabel='通过'
        onConfirm={() => void executeApprove()}
      />
      <ConfirmAction
        open={pendingCsApprove !== null}
        onClose={() => setPendingCsApprove(null)}
        title='客服初审通过'
        description={`确认初审通过 ${pendingCsApprove?.username ?? ''} 的提现申请？将流转至财务复审阶段。`}
        confirmLabel='确认初审'
        onConfirm={() => void executeCsApprove()}
      />
      <ProofDialog
        open={proofRow !== null}
        url={proofUrl}
        onUrl={setProofUrl}
        note={proofNote}
        onNote={setProofNote}
        error={proofError}
        uploading={proofUploading}
        onClose={() => setProofRow(null)}
        onSubmit={() => void submitProof()}
      />
    </>
  )
}
