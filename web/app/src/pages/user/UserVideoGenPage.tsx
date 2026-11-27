import { PlayIcon, VideoIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { HistoryList, type HistoryRow } from '@/pages/user/gen/HistoryList'
import { useVideoGen } from '@/pages/user/video/useVideoGen'
import { VideoForm } from '@/pages/user/video/VideoForm'
import { VideoResult } from '@/pages/user/video/VideoResult'
import { pickVideoUrl } from '@/pages/user/video/videoModel'

/** Video generation: the request form on the left, the current result and finished history stacked on the right. */
export function UserVideoGenPage() {
  const gen = useVideoGen()

  const rows: HistoryRow[] = gen.history.map((task, index) => {
    const url = pickVideoUrl(task.url, task.result?.url, task.items, task.result?.items)
    const prompt = ((task.request?.prompt as string | undefined) ?? '').trim() || '视频生成'
    return {
      key: task.task_id ?? task.id ?? index,
      title: prompt,
      meta: task.created_at ? new Date(task.created_at).toLocaleDateString('zh-CN') : '',
      lead: <VideoIcon aria-hidden className='size-4' />,
      body: url ? (
        <a
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex w-fit items-center gap-1.5 text-xs font-medium text-brand underline-offset-4 hover:underline'
        >
          <PlayIcon aria-hidden className='size-3' />
          播放视频
        </a>
      ) : undefined,
    }
  })

  return (
    <>
      <PageHeader title='视频生成' description='用提示词、参考图或参考视频生成视频，完成后自动展示结果。' />
      {gen.error ? (
        <Alert variant='destructive'>
          <AlertDescription>{gen.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='grid min-w-0 items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]'>
        <VideoForm gen={gen} />
        <div className='flex min-w-0 flex-col gap-6'>
          <VideoResult phase={gen.task.phase} taskId={gen.task.taskId} message={gen.task.message} url={gen.task.result ?? ''} />
          <HistoryList title='历史生成' rows={rows} onRefresh={gen.reloadHistory} />
        </div>
      </div>
    </>
  )
}
