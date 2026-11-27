import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TablePaginationProps {
  current: number
  total: number
  pageSize: number
  onChange: (page: number) => void
  className?: string
  jumpStep?: number
  maxActionsPerSecond?: number
}

function clampPage(page: number, maxPage: number) {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.trunc(page), 1), maxPage)
}

/** One-line pager: the count and position on the left, step and jump controls on the right. Page changes are rate limited. */
export function TablePagination({
  current,
  total,
  pageSize,
  onChange,
  className,
  jumpStep = 5,
  maxActionsPerSecond = 10,
}: TablePaginationProps) {
  const maxPage = Math.ceil(total / pageSize) || 1
  const currentPage = clampPage(current, maxPage)
  const [rateLimited, setRateLimited] = useState(false)
  const pageInputRef = useRef<HTMLInputElement>(null)
  const actionTimesRef = useRef<number[]>([])
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current)
      }
    }
  }, [])

  function canRunAction() {
    const now = Date.now()
    const recent = actionTimesRef.current.filter((time) => now - time < 1000)

    if (recent.length >= maxActionsPerSecond) {
      const waitMs = Math.max(100, 1000 - (now - recent[0]))
      actionTimesRef.current = recent
      setRateLimited(true)
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current)
      }
      releaseTimerRef.current = setTimeout(() => setRateLimited(false), waitMs)
      return false
    }

    actionTimesRef.current = [...recent, now]
    return true
  }

  function changePage(next: number) {
    const target = clampPage(next, maxPage)
    if (target === currentPage || !canRunAction()) return
    onChange(target)
  }

  function submitPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    changePage(Number(pageInputRef.current?.value))
  }

  const actionsDisabled = rateLimited || total <= 0
  const atStart = actionsDisabled || currentPage <= 1
  const atEnd = actionsDisabled || currentPage >= maxPage

  return (
    <nav
      data-slot='table-pagination'
      aria-label='表格分页'
      className={cn(
        'flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-glass-border bg-glass-strong/70 px-3 py-1 text-xs',
        className,
      )}
    >
      <div className='font-mono text-muted-foreground tabular-nums'>
        共 {total} 条 · 第 {currentPage} / {maxPage} 页
      </div>
      <div className='flex items-center gap-1'>
        <Button variant='ghost' size='icon-xs' type='button' aria-label={`前 ${jumpStep} 页`} title={`前 ${jumpStep} 页`} onClick={() => changePage(currentPage - jumpStep)} disabled={atStart}>
          <ChevronsLeftIcon />
        </Button>
        <Button variant='ghost' size='icon-xs' type='button' aria-label='上一页' title='上一页' onClick={() => changePage(currentPage - 1)} disabled={atStart}>
          <ChevronLeftIcon />
        </Button>
        <Button variant='ghost' size='icon-xs' type='button' aria-label='下一页' title='下一页' onClick={() => changePage(currentPage + 1)} disabled={atEnd}>
          <ChevronRightIcon />
        </Button>
        <Button variant='ghost' size='icon-xs' type='button' aria-label={`后 ${jumpStep} 页`} title={`后 ${jumpStep} 页`} onClick={() => changePage(currentPage + jumpStep)} disabled={atEnd}>
          <ChevronsRightIcon />
        </Button>
        <form className='ml-2 flex items-center gap-1.5' onSubmit={submitPage}>
          <Input
            key={currentPage}
            ref={pageInputRef}
            type='number'
            aria-label='跳转页码'
            min={1}
            max={maxPage}
            defaultValue={currentPage}
            className='h-7 w-14 px-1.5 text-center text-xs tabular-nums'
          />
          <Button type='submit' variant='ghost' size='xs' disabled={actionsDisabled}>
            跳转
          </Button>
        </form>
      </div>
      {rateLimited ? (
        <div role='status' aria-live='polite' className='basis-full text-right text-xs text-muted-foreground'>
          操作太快，请稍后再试
        </div>
      ) : null}
    </nav>
  )
}
