import { useMemo, useState } from 'react'
import type { UIEvent } from 'react'
import {
  DownloadIcon,
  FilmIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserTask } from '@/lib/api/user'
import { HISTORY_RETENTION_HOURS } from './constants'
import type { CreationMode, ReusePayload } from './types'
import { openImageUrl, triggerDownload } from './media'
import { toHistoryView } from './historyView'

export function HistoryPanel({
  mode,
  tasks,
  loading,
  loadingMore,
  hasMore,
  total,
  onRefresh,
  onLoadMore,
  onClear,
  onReuse,
  onMakeVideo,
}: {
  mode: CreationMode
  tasks: UserTask[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  total: number
  onRefresh: () => void
  onLoadMore: () => void
  onClear: () => void
  onReuse: (payload: ReusePayload) => void
  onMakeVideo: (imageUrl: string, prompt: string) => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)

  const views = useMemo(() => {
    return tasks
      .map((task) => toHistoryView(task, mode))
      .filter((v): v is NonNullable<typeof v> => v !== null)
  }, [tasks, mode])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
    if (remaining < 96 && hasMore && !loading && !loadingMore) {
      onLoadMore()
    }
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-1 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">历史生成</span>
          <div className="flex items-center gap-3">
            {views.length > 0 ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                清空
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              刷新
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          仅保留近 {HISTORY_RETENTION_HOURS} 小时，请及时下载
          {total > 0 ? <span className="ml-1">已加载 {tasks.length}/{total}</span> : null}
        </p>
      </div>

      <CardContent className="max-h-[640px] flex-1 overflow-y-auto p-2" onScroll={handleScroll}>
        {loading && views.length === 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : views.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">暂无历史记录</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {views.map((view) => (
                <div key={view.key} className="group relative overflow-hidden rounded-lg border border-border/60">
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => (view.mode === 'image' ? openImageUrl(view.thumbnail) : openImageUrl(view.videoUrl))}
                  >
                    {view.mode === 'image' ? (
                      <img src={view.thumbnail} alt={view.prompt} className="aspect-square w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid aspect-square w-full place-items-center bg-muted/40">
                        <PlayIcon className="size-7 text-muted-foreground" />
                      </div>
                    )}
                  </button>

                  <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white">
                    {view.mode === 'image' ? '图片' : '视频'}
                  </span>

                  <div className="absolute right-1 top-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="历史记录操作"
                          className="grid size-6 place-items-center rounded-md bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <MoreVerticalIcon className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onReuse(view.reuse)}>
                          <RotateCcwIcon className="size-4" /> 复用参数
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => triggerDownload(view.mode === 'image' ? view.thumbnail : view.videoUrl)}
                        >
                          <DownloadIcon className="size-4" /> 下载
                        </DropdownMenuItem>
                        {view.mode === 'image' ? (
                          <DropdownMenuItem onClick={() => onMakeVideo(view.thumbnail, view.prompt)}>
                            <FilmIcon className="size-4" /> 做成视频
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {view.prompt ? <p className="line-clamp-2 text-[10px] leading-tight text-white">{view.prompt}</p> : null}
                    <p className="mt-0.5 text-[9px] text-white/60">{view.date}</p>
                  </div>
                </div>
              ))}
            </div>
            {loadingMore ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                加载更多
              </div>
            ) : hasMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                className="w-full rounded-md border border-border/70 py-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                加载更多
              </button>
            ) : null}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空{mode === 'image' ? '图片' : '视频'}历史记录？</AlertDialogTitle>
            <AlertDialogDescription>清空后无法恢复，作品文件将一并移除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onClear(); setConfirmClear(false) }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              <Trash2Icon className="size-4" /> 确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
