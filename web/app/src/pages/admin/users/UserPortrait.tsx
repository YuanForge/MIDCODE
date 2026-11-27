import { useState, type ReactNode } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminUserPortrait } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-xs font-medium text-muted-foreground'>{title}</h3>
      {children}
    </section>
  )
}

/** Thirty days of spending, the models used most, the keys held, and the risk labels an admin has put on the account. */
export function UserPortrait({ userId }: { userId: number }) {
  const { data: portrait, loading, error, reload } = useAsync(async () => {
    return adminApi.getUserPortrait(userId) as Promise<AdminUserPortrait>
  }, null as AdminUserPortrait | null, [userId])

  const [newLabel, setNewLabel] = useState('')
  const [labelError, setLabelError] = useState('')

  async function addLabel() {
    if (!newLabel.trim()) return
    setLabelError('')
    try {
      await adminApi.addRiskLabel(userId, { label: newLabel.trim(), reason: '' })
      setNewLabel('')
      reload()
    } catch (err) {
      setLabelError(getApiErrorMessage(err))
    }
  }

  async function removeLabel(labelId: number) {
    setLabelError('')
    try {
      await adminApi.deleteRiskLabel(labelId)
      reload()
    } catch (err) {
      setLabelError(getApiErrorMessage(err))
    }
  }

  if (loading) return <Skeleton className='mt-2 h-40 w-full' />
  if (error) {
    return (
      <Alert variant='destructive' className='mt-2'>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!portrait) return <p className='py-6 text-center text-sm text-muted-foreground'>暂无数据</p>

  const labels = portrait.risk_labels ?? []
  const topModels = portrait.top_models ?? []
  const apiKeys = portrait.api_keys ?? []
  const dailySpend = portrait.daily_spend ?? []
  const max = Math.max(...dailySpend.map((day) => day.amount ?? 0), 1)
  const sum = dailySpend.reduce((total, day) => total + (day.amount ?? 0), 0)

  return (
    <div className='flex flex-col gap-5 pt-2'>
      <Block title='近 30 日消费趋势'>
        {dailySpend.length === 0 ? (
          <p className='text-sm text-muted-foreground'>暂无消费记录</p>
        ) : (
          <>
            <div role='img' aria-label={`近 30 日消费合计 ¥${sum.toFixed(4)}`} className='flex h-20 w-full items-end gap-0.5'>
              {dailySpend.map((day, index) => (
                <div
                  key={index}
                  className='flex-1 rounded-sm bg-chart-1'
                  style={{ height: `${Math.max(2, Math.round(((day.amount ?? 0) / max) * 72))}px` }}
                  title={`${day.day}: ¥${(day.amount ?? 0).toFixed(4)}`}
                />
              ))}
            </div>
            <p className='text-xs tabular-nums text-muted-foreground'>合计 ¥{sum.toFixed(4)}</p>
          </>
        )}
      </Block>

      {topModels.length > 0 ? (
        <Block title='Top 模型（调用次数）'>
          <ul className='divide-y divide-glass-border overflow-hidden rounded-xl border border-glass-border'>
            {topModels.slice(0, 5).map((item, index) => (
              <li key={index} className='flex items-center justify-between gap-3 py-1.5 text-sm'>
                <span className='max-w-[60%] truncate font-mono text-xs'>{item.model}</span>
                <span className='tabular-nums text-muted-foreground'>{item.calls?.toLocaleString('zh-CN')} 次</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {apiKeys.length > 0 ? (
        <Block title='API Keys'>
          <ul className='divide-y divide-glass-border overflow-hidden rounded-xl border border-glass-border'>
            {apiKeys.map((key, index) => {
              const active = key.is_active ?? true
              return (
                <li key={key.id ?? index} className='flex items-center justify-between gap-3 py-1.5 text-sm'>
                  <span className='max-w-[70%] truncate font-mono text-xs'>{key.name ?? `Key #${key.id}`}</span>
                  <StatusBadge tone={active ? 'success' : 'neutral'}>{active ? '有效' : '已禁用'}</StatusBadge>
                </li>
              )
            })}
          </ul>
        </Block>
      ) : null}

      <Block title='风险标签'>
        <div className='flex flex-wrap gap-1.5'>
          {labels.length === 0 ? (
            <span className='text-sm text-muted-foreground'>无标签</span>
          ) : (
            labels.map((item) => (
              <Badge key={item.id} variant='destructive' className='gap-1 text-xs'>
                {item.label}
                <button
                  type='button'
                  aria-label={`移除风险标签 ${item.label}`}
                  onClick={() => item.id != null && void removeLabel(item.id)}
                  className='text-xs hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                >
                  ×
                </button>
              </Badge>
            ))
          )}
        </div>
        {labelError ? (
          <p role='alert' className='text-xs text-destructive'>
            {labelError}
          </p>
        ) : null}
        <div className='flex gap-2'>
          <Input
            aria-label='添加风险标签'
            className='h-8 text-xs'
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder='添加风险标签'
            onKeyDown={(event) => event.key === 'Enter' && void addLabel()}
          />
          <Button size='sm' variant='outline' onClick={() => void addLabel()}>
            添加
          </Button>
        </div>
      </Block>
    </div>
  )
}
