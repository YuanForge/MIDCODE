import { useMemo, useState } from 'react'
import {
  DownloadIcon,
  FilmIcon,
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
  onRefresh,
  onClear,
  onReuse,
  onMakeVideo,
}: {
  mode: CreationMode
  tasks: UserTask[]
  onRefresh: () => void
  onClear: () => void
  onReuse: (payload: ReusePayload) => void
  onMakeVideo: (imageUrl: string, prompt: string) => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)

  const views = useMemo(() => {
    const cutoff = Date.now() - HISTORY_RETENTION_HOURS * 3600_000
    return tasks
      .filter((task) => {
        if (!task.created_at) return true
        const t = new Date(task.created_at).getTime()
        return Number.isNaN(t) || t >= cutoff
      })
      .map((task) => toHistoryView(task, mode))
      .filter((v): v is NonNullable<typeof v> => v !== null)
  }, [tasks, mode])

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
        <p className="text-[11px] text-muted-foreground">仅保留近 {HISTORY_RETENTION_HOURS} 小时，请及时下载</p>
      </div>

      <CardContent className="max-h-[640px] flex-1 overflow-y-auto p-2">
        {views.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">暂无历史记录</p>
        ) : (
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
