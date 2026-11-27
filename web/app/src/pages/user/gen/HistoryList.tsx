import type { ReactNode } from 'react'

import { Section } from '@/components/shared/Section'
import { Button } from '@/components/ui/button'

export type HistoryRow = {
  key: string | number
  title: string
  meta?: string
  lead: ReactNode
  body?: ReactNode
}

/** Finished generations as a ruled list: a small mark, what was asked for and when, then the way to open the result. */
export function HistoryList({
  title,
  rows,
  onRefresh,
}: {
  title: string
  rows: HistoryRow[]
  onRefresh: () => void
}) {
  return (
    <Section
      title={title}
      panel
      actions={
        <Button variant='ghost' size='sm' onClick={onRefresh}>
          刷新
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className='py-6 text-center text-xs text-muted-foreground'>暂无历史记录</p>
      ) : (
        <ul className='max-h-[520px] divide-y divide-glass-border overflow-y-auto'>
          {rows.map((row) => (
            <li key={row.key} className='flex flex-col gap-2 py-3'>
              <div className='flex items-start gap-3'>
                <span className='flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-glass-border bg-glass-strong text-muted-foreground'>
                  {row.lead}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='line-clamp-2 text-[13px] leading-snug font-medium text-foreground'>{row.title}</p>
                  {row.meta ? <p className='mt-0.5 truncate text-xs text-muted-foreground'>{row.meta}</p> : null}
                </div>
              </div>
              {row.body}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
