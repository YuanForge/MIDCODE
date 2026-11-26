import { MusicIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { HistoryList, type HistoryRow } from '@/pages/user/gen/HistoryList'
import type { MusicItem } from '@/pages/user/music/musicModel'
import { MusicForm } from '@/pages/user/music/MusicForm'
import { MusicResult } from '@/pages/user/music/MusicResult'
import { useMusicGen } from '@/pages/user/music/useMusicGen'

/** Music generation: the request form on the left, the current result and finished history stacked on the right. */
export function UserMusicGenPage() {
  const gen = useMusicGen()

  const rows: HistoryRow[] = gen.history.map((task, index) => {
    const songs =
      (task.items as MusicItem[] | undefined) ?? (task.result as { items?: MusicItem[] } | undefined)?.items ?? []
    const first = songs[0]
    const prompt =
      (task.request?.gpt_description_prompt as string | undefined) ?? (task.request?.prompt as string | undefined) ?? ''
    const date = task.created_at ? new Date(task.created_at).toLocaleDateString('zh-CN') : ''
    return {
      key: task.task_id ?? task.id ?? index,
      title: first?.title ?? (prompt.slice(0, 24) || '音乐生成'),
      meta: [first?.tags, date].filter(Boolean).join(' · '),
      lead: first?.image_url ? (
        <img alt='' src={first.image_url} loading='lazy' className='size-full object-cover' />
      ) : (
        <MusicIcon aria-hidden className='size-4' />
      ),
      body: first?.audio_url ? (
        <audio controls src={first.audio_url} className='h-8 w-full'>
          <track kind='captions' />
        </audio>
      ) : undefined,
    }
  })

  return (
    <>
      <PageHeader title='音乐生成' description='用灵感描述或自定义歌词生成音乐，完成后自动展示结果。' />
      {gen.error ? (
        <Alert variant='destructive'>
          <AlertDescription>{gen.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='grid min-w-0 items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]'>
        <MusicForm gen={gen} />
        <div className='flex min-w-0 flex-col gap-6'>
          <MusicResult phase={gen.task.phase} taskId={gen.task.taskId} message={gen.task.message} items={gen.task.result ?? []} />
          <HistoryList title='历史生成' rows={rows} onRefresh={gen.reloadHistory} />
        </div>
      </div>
    </>
  )
}
