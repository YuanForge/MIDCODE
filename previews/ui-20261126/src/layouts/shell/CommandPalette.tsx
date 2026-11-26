import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchIcon } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { PaletteEntry } from '@/layouts/shell/navModel'
import { cn } from '@/lib/utils'

function filterEntries(entries: PaletteEntry[], query: string) {
  const tokens = query.trim().toLowerCase().split(' ').filter(Boolean)
  if (tokens.length === 0) return entries
  return entries.filter((entry) => {
    const haystack = `${entry.label} ${entry.group} ${entry.href}`.toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}

/** The search box and the list. Mounted only while the palette is open, so it starts empty every time. */
function PaletteBody({
  entries,
  placeholder,
  emptyText,
  hints,
  onClose,
}: {
  entries: PaletteEntry[]
  placeholder: string
  emptyText: string
  hints: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const results = useMemo(() => filterEntries(entries, query), [entries, query])
  const active = Math.min(index, Math.max(results.length - 1, 0))

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  function open(entry: PaletteEntry | undefined) {
    if (!entry) return
    onClose()
    navigate(entry.href)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex(Math.min(active + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex(Math.max(active - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      open(results[active])
    }
  }

  return (
    <div>
      <div className='flex items-center gap-2 border-b border-border px-3'>
        <SearchIcon aria-hidden className='size-4 shrink-0 text-muted-foreground' />
        <input
          role='combobox'
          aria-expanded
          aria-controls='palette-list'
          aria-activedescendant={results[active] ? `palette-${active}` : undefined}
          aria-label={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className='h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground'
        />
      </div>
      {results.length === 0 ? <p className='px-3 py-8 text-center text-xs text-muted-foreground'>{emptyText}</p> : null}
      <ul id='palette-list' role='listbox' ref={list} className='max-h-[50vh] overflow-y-auto p-1'>
        {results.map((entry, i) => (
          <li
            key={entry.href}
            id={`palette-${i}`}
            role='option'
            aria-selected={i === active}
            onMouseMove={() => setIndex(i)}
            onClick={() => open(entry)}
            className={cn(
              'flex h-8 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-[13px]',
              i === active ? 'bg-muted text-foreground shadow-[inset_2px_0_0_var(--primary)]' : 'text-muted-foreground',
            )}
          >
            <entry.icon className='size-4 shrink-0' />
            <span className='truncate text-foreground'>{entry.label}</span>
            {entry.group ? <span className='truncate text-xs text-faint'>{entry.group}</span> : null}
            <span className='ml-auto shrink-0 font-mono text-[11px] text-faint'>{entry.href}</span>
          </li>
        ))}
      </ul>
      <p className='border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground'>{hints}</p>
    </div>
  )
}

/** Jump to any page by typing part of its name or path. */
export function CommandPalette({
  open,
  onOpenChange,
  entries,
  title,
  placeholder,
  emptyText,
  hints,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  entries: PaletteEntry[]
  title: string
  placeholder: string
  emptyText: string
  hints: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className='top-[16%] translate-y-0 gap-0 overflow-hidden rounded-lg p-0 sm:max-w-xl sm:p-0'>
        <DialogTitle className='sr-only'>{title}</DialogTitle>
        <DialogDescription className='sr-only'>{placeholder}</DialogDescription>
        <PaletteBody entries={entries} placeholder={placeholder} emptyText={emptyText} hints={hints} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
