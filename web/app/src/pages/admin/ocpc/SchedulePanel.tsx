import { Section } from '@/components/shared/Section'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { INTERVALS } from '@/pages/admin/ocpc/platformForm'

/** Scheduled reporting: whether it runs, how often, and a button to run it now. The answer of a manual run stays below as a code block. */
export function SchedulePanel({
  enabled,
  onEnabled,
  interval,
  onInterval,
  onSave,
  onUpload,
  uploading,
  result,
}: {
  enabled: boolean
  onEnabled: (next: boolean) => void
  interval: string
  onInterval: (next: string) => void
  onSave: () => void
  onUpload: () => void
  uploading: boolean
  result: string
}) {
  return (
    <Section title='自动上报'>
      <div className='glass flex flex-wrap items-end gap-4 p-4'>
        <label className='flex h-9 items-center gap-2 text-sm'>
          <input type='checkbox' className='size-4 accent-primary' checked={enabled} onChange={(event) => onEnabled(event.target.checked)} />
          自动上报
        </label>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='ocpc-interval' className='text-xs text-muted-foreground'>
            调度间隔
          </Label>
          <NativeSelect id='ocpc-interval' className='w-40' value={interval} onChange={(event) => onInterval(event.target.value)}>
            {INTERVALS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button onClick={onSave}>保存调度</Button>
        <Button variant='outline' onClick={onUpload} disabled={uploading}>
          {uploading ? '上报中...' : '立即上报'}
        </Button>
      </div>
      {result ? <pre className='mt-4 max-h-80 overflow-auto rounded-md border border-glass-border bg-glass-strong/50 p-4 text-xs'>{result}</pre> : null}
    </Section>
  )
}
