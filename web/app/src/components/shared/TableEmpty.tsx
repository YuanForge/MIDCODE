import type { ComponentType } from 'react'
import { InboxIcon } from 'lucide-react'

import { TableCell, TableRow } from '@/components/ui/table'

export function TableEmpty({
  cols,
  title = '暂无数据',
  description,
  Icon = InboxIcon,
}: {
  cols: number
  title?: string
  description?: string
  Icon?: ComponentType<{ className?: string }>
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="py-14">
        <div className="sticky left-0 flex w-[min(100%,calc(100vw-4rem))] flex-col items-center justify-center gap-2 text-center whitespace-normal">
          <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-glass-strong">
            <Icon className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description ? (
            <p className="max-w-sm text-[13px] leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}
