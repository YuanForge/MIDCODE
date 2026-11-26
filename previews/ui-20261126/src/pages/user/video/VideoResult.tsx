import { Section } from '@/components/shared/Section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { TaskPhase } from '@/pages/user/gen/useGenTask'

/** The current task: waiting, failed with a reason, or the finished video. */
export function VideoResult({
  phase,
  taskId,
  message,
  url,
}: {
  phase: TaskPhase
  taskId: string
  message: string
  url: string
}) {
  return (
    <Section title='生成结果' panel>
      <div className='flex min-h-[320px] flex-col gap-4'>
        {phase === 'polling' ? (
          <Alert>
            <AlertDescription>
              生成中，任务 ID：<span className='font-mono'>{taskId}</span>，完成后将自动展示。
            </AlertDescription>
          </Alert>
        ) : null}
        {phase === 'failed' && message ? (
          <Alert variant='destructive'>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {taskId && phase !== 'polling' ? <p className='text-xs text-muted-foreground'>任务 ID：{taskId}</p> : null}
        {url ? (
          <div className='flex flex-col gap-2'>
            <video controls src={url} className='aspect-video w-full rounded-md border border-glass-border bg-code'>
              <track kind='captions' />
            </video>
            <a
              href={url}
              target='_blank'
              rel='noopener noreferrer'
              className='w-fit text-xs text-brand underline-offset-4 hover:underline'
            >
              在新标签页打开视频
            </a>
          </div>
        ) : phase === 'idle' ? (
          <p className='text-sm text-muted-foreground'>提交后将在这里显示任务信息和结果视频。</p>
        ) : null}
      </div>
    </Section>
  )
}
