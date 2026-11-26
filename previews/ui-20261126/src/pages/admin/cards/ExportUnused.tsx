import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi, type AdminCardBatch } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { buildUnusedCsv, downloadCsv } from '@/pages/admin/cards/cardFormat'

const ALL = '__all__'

/** Export every unused code as a CSV. The codes are plain text, so the person's own password is asked for first. */
export function ExportUnused({ batches }: { batches: AdminCardBatch[] }) {
  const [open, setOpen] = useState(false)
  const [batchId, setBatchId] = useState(ALL)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  function openDialog() {
    setPassword('')
    setError('')
    setOpen(true)
  }

  async function exportCards() {
    setExporting(true)
    setError('')
    try {
      await adminApi.verifyAdminPassword(password)
      const params: Record<string, unknown> = { status: 'unused', limit: 10000 }
      if (batchId !== ALL) params.batch_id = batchId
      const response = await adminApi.listCards(params)
      downloadCsv(buildUnusedCsv(response.cards ?? []), `unused_cards_${new Date().toISOString().slice(0, 10)}.csv`)
      setOpen(false)
      setPassword('')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Button variant='outline' onClick={openDialog} disabled={exporting}>
        导出未用卡密
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出未用卡密</DialogTitle>
            <DialogDescription>导出的是明文兑换码，需要再次输入登录密码确认。</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='export-batch'>按批次筛选</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger id='export-batch'>
                  <SelectValue placeholder='所有批次' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>所有批次</SelectItem>
                  {batches
                    .filter((batch) => batch.batch_id)
                    .map((batch) => (
                      <SelectItem key={batch.batch_id} value={batch.batch_id ?? ''}>
                        {batch.batch_id} {batch.note ? `— ${batch.note}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='export-password'>操作人密码（二次确认）</Label>
              <Input
                id='export-password'
                type='password'
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder='请输入您的登录密码'
                onKeyDown={(event) => event.key === 'Enter' && password && void exportCards()}
              />
            </div>
            {error ? (
              <Alert variant='destructive'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void exportCards()} disabled={exporting || !password}>
              {exporting ? '导出中…' : '确认导出'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
