import { useMemo, useState } from 'react'
import { CopyIcon, PlayIcon, SearchIcon, SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { GALLERY_ITEMS, type GalleryItem } from './inspiration'

type Filter = 'all' | 'image' | 'video'

export function InspirationGallery({ onUse }: { onUse: (item: GalleryItem) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [category, setCategory] = useState('全部')
  const [query, setQuery] = useState('')

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(GALLERY_ITEMS.map((it) => it.category)))],
    []
  )

  const list = useMemo(() => {
    let items = GALLERY_ITEMS
    if (filter !== 'all') items = items.filter((it) => it.type === filter)
    if (category !== '全部') items = items.filter((it) => it.category === category)
    const q = query.trim()
    if (q) items = items.filter((it) => it.text.includes(q) || it.category.includes(q))
    return items
  }, [filter, category, query])

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
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索题材或提示词…" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                category === c ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">没有匹配的内容</p>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {list.map((it) => {
            const isVideo = it.type === 'video'
            return (
              <div key={it.id} className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg">
                <div className="relative" style={{ aspectRatio: isVideo ? '16/9' : '4/3', background: it.gradient }}>
                  {isVideo ? (
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="grid size-12 place-items-center rounded-full bg-white/25 text-white backdrop-blur transition-colors group-hover:bg-white/35">
                        <PlayIcon className="size-5" />
                      </div>
                    </div>
                  ) : null}
                  <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {isVideo ? '视频' : '图片'}
                  </span>
                  {it.hot ? (
                    <span className="absolute right-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">热门</span>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2 text-[10px] text-white/90">
                    <span>{it.category}</span>
                    {it.likes ? <span>♥ {it.likes}</span> : null}
                  </div>
                </div>
                <div className="p-3">
                  <p className="mb-2.5 line-clamp-2 min-h-[38px] text-[13px] leading-relaxed text-foreground">{it.text}</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="flex-1" onClick={() => onUse(it)}>
                      <SparklesIcon className="size-3.5" /> 用它创作
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(it.text)
                        toast.success('已复制提示词')
                      }}
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
