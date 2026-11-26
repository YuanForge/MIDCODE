import { Section } from '@/components/shared/Section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { TaskPhase } from '@/pages/user/gen/useGenTask'
import type { MusicItem } from '@/pages/user/music/musicModel'

/** The current task: waiting, failed with a reason, or the finished songs with a player each. */
export function MusicResult({
  phase,
  taskId,
  message,
  items,
}: {
  phase: TaskPhase
  taskId: string
  message: string
  items: MusicItem[]
}) {
  return (
    <Section title='生成结果' panel>
      <div className='flex min-h-[320px] flex-col gap-4'>
        {phase === 'idle' && items.length === 0 ? (
          <p className='text-sm text-muted-foreground'>提交后将在这里显示生成的音乐。</p>
        ) : null}
        {phase === 'polling' ? (
          <Alert>
            <AlertDescription>
              任务生成中，任务 ID：<span className='font-mono'>{taskId}</span>。完成后将自动展示。
            </AlertDescription>
          </Alert>
        ) : null}
        {phase === 'failed' && message ? (
          <Alert variant='destructive'>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {items.length > 0 ? (
          <ul className='flex flex-col divide-y divide-glass-border'>
            {items.map((item, index) => (
              <li key={index} className='flex flex-col gap-3 py-4 sm:flex-row'>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title || '封面'} className='size-32 shrink-0 rounded-md object-cover' />
                ) : null}
                <div className='flex min-w-0 flex-1 flex-col gap-2'>
                  <p className='text-sm font-medium text-foreground'>{item.title || `音乐 ${index + 1}`}</p>
                  {item.tags ? <p className='text-xs text-muted-foreground'>{item.tags}</p> : null}
                  {item.audio_url ? (
                    <audio controls src={item.audio_url} className='w-full'>
                      <track kind='captions' />
                    </audio>
                  ) : null}
                  {item.video_url ? (
                    <a
                      href={item.video_url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='w-fit text-xs text-brand underline-offset-4 hover:underline'
                    >
                      查看视频版本
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Section>
  )
}
