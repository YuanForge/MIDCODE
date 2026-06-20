import { DownloadIcon, FilmIcon, ImageIcon, RotateCcwIcon, VideoIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CreationMode, TaskStatus } from './types'
import { openImageUrl, triggerDownload } from './media'

export function ResultPanel({
  mode,
  status,
  taskId,
  taskError,
  images,
  videoUrl,
  prompt,
  onRegenerate,
  onMakeVideo,
}: {
  mode: CreationMode
  status: TaskStatus
  taskId: string
  taskError: string
  images: string[]
  videoUrl: string
  prompt: string
  onRegenerate: () => void
  onMakeVideo: (imageUrl: string) => void
}) {
  const Icon = mode === 'image' ? ImageIcon : VideoIcon

  return (
    <Card className="min-h-[480px]">
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Icon className="size-4 text-primary" />
            生成结果
            <span className="font-normal text-muted-foreground">{mode === 'image' ? '图片' : '视频'}模式</span>
          </div>
          {status === 'done' ? (
            <Button variant="ghost" size="sm" onClick={onRegenerate}>
              <RotateCcwIcon className="size-3.5" /> 重新生成
            </Button>
          ) : null}
        </div>

        {status === 'polling' ? (
          <Alert>
            <AlertDescription>
              {taskId ? <>生成中，任务 ID：<span className="font-mono">{taskId}</span>，完成后自动展示。</> : '提交中…'}
            </AlertDescription>
          </Alert>
        ) : null}

        {status === 'failed' && taskError ? (
          <Alert variant="destructive">
            <AlertDescription>{taskError}</AlertDescription>
          </Alert>
        ) : null}

        {status === 'idle' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="grid size-14 place-items-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
              <Icon className="size-6" />
            </div>
            <div className="text-sm font-medium text-foreground">填写左侧参数，开始创作</div>
            <div className="max-w-[280px] text-xs text-muted-foreground">提交后结果将在这里展示。</div>
          </div>
        ) : null}

        {status === 'done' && mode === 'image' && images.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {images.map((url, index) => (
              <div key={`${index}-${url.slice(0, 48)}`} className="group relative overflow-hidden rounded-xl border border-border">
                <img
                  src={url}
                  alt="generated"
                  className="aspect-square w-full cursor-zoom-in object-cover"
                  onClick={() => openImageUrl(url)}
                />
                <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => triggerDownload(url)}>
                    <DownloadIcon className="size-3.5" /> 下载
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => onMakeVideo(url)}>
                    <FilmIcon className="size-3.5" /> 做成视频
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {status === 'done' && mode === 'video' && videoUrl ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-border bg-black">
              <video src={videoUrl} controls className="aspect-video w-full">
                <track kind="captions" />
              </video>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => triggerDownload(videoUrl)}>
                <DownloadIcon className="size-3.5" /> 下载视频
              </Button>
              <Button variant="outline" className="flex-1" onClick={onRegenerate}>
                <RotateCcwIcon className="size-3.5" /> 重新生成
              </Button>
            </div>
            {prompt ? (
              <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">{prompt}</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
