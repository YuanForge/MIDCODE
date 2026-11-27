import * as React from 'react'

import { cn } from '@/lib/utils'

// Glass table: the header is a lighter band, rows stay solid with soft rules, numbers stay tabular.
// The glass sheet around a table comes from its Panel, so rows never stack glass on glass.
// A body fades in once when it mounts, which is when its rows arrive in place of the loading rows.
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot='table-container' className='relative w-full overflow-x-auto'>
      <table
        data-slot='table'
        className={cn('w-full caption-bottom text-sm tabular-nums', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot='table-header'
      className={cn('[&_tr]:h-10 [&_tr]:border-b [&_tr]:border-glass-border [&_tr]:bg-glass-strong/60 [&_tr]:hover:bg-glass-strong/60', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot='table-body'
      className={cn('animate-arrive [&_tr]:h-11 [&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot='table-footer'
      className={cn('border-t border-glass-border bg-glass-strong/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot='table-row'
      className={cn(
        'border-b border-glass-border transition-[background-color,box-shadow] duration-100 hover:bg-glass-strong/60 has-aria-expanded:bg-glass-strong/70 data-[state=selected]:bg-glass-strong data-[state=selected]:shadow-[inset_3px_0_0_var(--primary)]',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot='table-head'
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot='table-cell'
      className={cn(
        'h-11 px-3 py-2 align-middle whitespace-nowrap first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot='table-caption'
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
