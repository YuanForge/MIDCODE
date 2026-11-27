import { useMemo, useState } from 'react'
import { ImageIcon, SearchIcon, SparklesIcon, Trash2Icon, VideoIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { CreationMode } from './constants'
import type { PromptHistoryEntry } from './usePromptHistory'

type Filter = 'all' | CreationMode

export function PromptHistoryTab({
  entries,
  onUse,
  onRemove,
  onClear,
}: {
  entries: PromptHistoryEntry[]
  onUse: (prompt: string, mode: CreationMode) => void
  onRemove: (prompt: string) => void
  onClear: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    let items = entries
    if (filter !== 'all') items = items.filter((e) => e.mode === filter)
    const q = query.trim()
    if (q) items = items.filter((e) => e.prompt.includes(q))
    return items
  }, [entries, filter, query])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-lg border border-input p-1">
          {([['all', '全部'], ['image', '图片'], ['video', '视频']] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                'rounded-md px-4 py-1.5 text-xs font-medium transition-colors',
                filter === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索历史提示词…" className="pl-9" />
        </div>
        <div className="flex items-center gap-3 sm:ml-auto">
          <span className="text-xs text-muted-foreground">{list.length} 条</span>
          {entries.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={onClear}>
              <Trash2Icon className="size-3.5" /> 清空
            </Button>
          ) : null}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          {entries.length === 0 ? '还没有历史提示词，生成一次后会自动记录' : '没有匹配的提示词'}
        </p>
      ) : (
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {list.map((entry) => (
            <div
              key={`${entry.at}-${entry.prompt.slice(0, 12)}`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium">
                  {entry.mode === 'image' ? <ImageIcon className="size-3" /> : <VideoIcon className="size-3" />}
                  {entry.mode === 'image' ? '图片' : '视频'}
                </span>
                <span className="ml-auto">{new Date(entry.at).toLocaleString('zh-CN')}</span>
              </div>
              <p className="line-clamp-3 min-h-[54px] text-[13px] leading-relaxed text-foreground">{entry.prompt}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" className="flex-1" onClick={() => onUse(entry.prompt, entry.mode)}>
                  <SparklesIcon className="size-3.5" /> 用它创作
                </Button>
                <Button size="icon" variant="outline" onClick={() => onRemove(entry.prompt)}>
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
