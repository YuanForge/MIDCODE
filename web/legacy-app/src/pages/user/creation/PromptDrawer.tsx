import { useMemo, useState } from 'react'
import { CheckIcon, PlusIcon, SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { CreationMode } from './constants'
import { PROMPT_LIBRARY, TAG_BLOCKS, appendToPrompt } from './inspiration'

export function PromptDrawer({
  open,
  onOpenChange,
  mode,
  prompt,
  onPromptChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: CreationMode
  prompt: string
  onPromptChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const items = PROMPT_LIBRARY[mode]
  const blocks = TAG_BLOCKS[mode]

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return items
    return items.filter((it) => it.text.includes(q) || it.category.includes(q))
  }, [items, query])

  function replace(text: string) {
    onPromptChange(text)
  }
  function append(text: string) {
    onPromptChange(appendToPrompt(prompt, text))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>灵感库 · {mode === 'image' ? '图片' : '视频'}</SheetTitle>
          <SheetDescription>挑一条提示词替换/追加，或点标签拼装。</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="relative mb-3">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索提示词…"
              className="pl-9"
            />
          </div>

          <Tabs defaultValue="lib" className="flex flex-1 flex-col overflow-hidden">
            <TabsList className="w-full">
              <TabsTrigger value="lib" className="flex-1">提示词库</TabsTrigger>
              <TabsTrigger value="blocks" className="flex-1">标签积木</TabsTrigger>
            </TabsList>

            <TabsContent value="lib" className="mt-3 flex-1 overflow-y-auto">
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">没有匹配的提示词</p>
                ) : (
                  filtered.map((it) => (
                    <div key={it.text} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <div className="mb-1 text-[10px] font-medium text-muted-foreground">{it.category}</div>
                      <p className="mb-2.5 text-xs leading-relaxed text-foreground">{it.text}</p>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => replace(it.text)}>
                          <CheckIcon className="size-3.5" /> 替换
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => append(it.text)}>
                          <PlusIcon className="size-3.5" /> 追加
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="blocks" className="mt-3 flex-1 overflow-y-auto">
              <div className="space-y-4">
                {blocks.map((block) => (
                  <div key={block.group}>
                    <div className="mb-2 text-xs font-semibold text-foreground">{block.group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {block.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => append(tag)}
                          className={cn(
                            'flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors',
                            'hover:border-primary hover:text-primary'
                          )}
                        >
                          <PlusIcon className="size-3" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
