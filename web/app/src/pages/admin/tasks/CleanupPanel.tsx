import { useState } from 'react'
import { RefreshCwIcon, Trash2Icon } from 'lucide-react'

import { Section } from '@/components/shared/Section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi, type AdminCleanupPreview, type AdminCleanupRunResult, type AdminCleanupTarget } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { CleanupConfirmDialog } from '@/pages/admin/tasks/CleanupConfirmDialog'
import { PreviewFacts } from '@/pages/admin/tasks/CleanupPreview'
import { CONFIRM_PHRASE, formatDateTime, minRetentionDays, targetLabel } from '@/pages/admin/tasks/taskFormat'

/**
 * Delete finished tasks or call logs older than a retention period. The flow is fixed: preview what would go, then run it behind a typed confirmation.
 * Changing the type or the days throws the preview away, so a run can only follow a preview of the same settings.
 */
export function CleanupPanel({ onCleaned }: { onCleaned: () => void }) {
  const [target, setTarget] = useState<AdminCleanupTarget>('tasks')
  const [retention, setRetention] = useState('90')
  const [preview, setPreview] = useState<AdminCleanupPreview | null>(null)
  const [result, setResult] = useState<AdminCleanupRunResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [runError, setRunError] = useState('')
  const [running, setRunning] = useState(false)

  const days = Number.parseInt(retention, 10)
  const minDays = minRetentionDays(target)
  const valid = Number.isInteger(days) && days >= minDays
  const current = preview?.target === target && preview?.retention_days === days

  function clearOutput() {
    setPreview(null)
    setResult(null)
    setError('')
  }

  function changeTarget(next: AdminCleanupTarget) {
    setTarget(next)
    clearOutput()
  }

  function changeRetention(next: string) {
    setRetention(next)
    clearOutput()
  }

  async function previewCleanup() {
    if (!valid) {
      setError(`保留天数不能少于 ${minDays} 天`)
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      setPreview(await adminApi.previewCleanup({ target, retention_days: days }))
    } catch (err) {
      setPreview(null)
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function openConfirm() {
    if (!current) {
      setError('请先按当前条件预估清理数量')
      return
    }
    setConfirmText('')
    setRunError('')
    setConfirmOpen(true)
  }

  async function runCleanup() {
    if (!current || confirmText.trim() !== CONFIRM_PHRASE) return
    setRunning(true)
    setRunError('')
    try {
      const res = await adminApi.runCleanup({ target, retention_days: days, confirm: confirmText })
      setResult(res)
      setPreview({
        target: res.target,
        target_label: res.target_label,
        retention_days: res.retention_days,
        min_retention_days: res.min_retention_days,
        cutoff: res.cutoff,
        count: res.remaining,
        statuses: res.statuses,
      })
      setConfirmOpen(false)
      setConfirmText('')
      if (res.target === 'tasks') onCleaned()
    } catch (err) {
      setRunError(getApiErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Section title='数据清理'>
      <div className='glass flex flex-col gap-4 p-4'>
        <p className='text-sm text-muted-foreground'>只清理已结束且早于保留期限的数据；进行中任务、账单流水不会被删除。</p>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='cleanup-target' className='text-xs text-muted-foreground'>
              清理类型
            </Label>
            <Select value={target} onValueChange={(next) => changeTarget(next as AdminCleanupTarget)}>
              <SelectTrigger id='cleanup-target' className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='tasks'>历史任务</SelectItem>
                <SelectItem value='llm_logs'>LLM 调用日志</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='cleanup-days' className='text-xs text-muted-foreground'>
              保留天数
            </Label>
            <Input id='cleanup-days' className='w-28' type='number' min={minDays} value={retention} onChange={(event) => changeRetention(event.target.value)} />
          </div>
          <Button variant='outline' onClick={() => void previewCleanup()} disabled={loading || !valid}>
            <RefreshCwIcon data-icon='inline-start' className={loading ? 'animate-spin' : undefined} />
            预估清理
          </Button>
          <Button variant='outline' className='text-destructive' onClick={openConfirm} disabled={!current || loading || (preview?.count ?? 0) <= 0}>
            <Trash2Icon data-icon='inline-start' />
            执行清理
          </Button>
        </div>

        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {preview ? <PreviewFacts preview={preview} /> : null}
        {result ? (
          <Alert variant={result.has_more ? 'warning' : 'success'}>
            <AlertDescription>
              已删除 {result.deleted.toLocaleString()} 条，剩余 {result.remaining.toLocaleString()} 条
              {result.has_more ? '；单次最多清理 50000 条，可再次执行。' : '。'}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <CleanupConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        targetName={preview?.target_label || targetLabel(target)}
        cutoff={formatDateTime(preview?.cutoff)}
        count={preview?.count ?? 0}
        text={confirmText}
        onText={setConfirmText}
        error={runError}
        running={running}
        onConfirm={() => void runCleanup()}
      />
    </Section>
  )
}
