import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { userApi } from '@/lib/api/user'
import { ModelPicker } from '@/pages/user/gen/ModelPicker'
import { ReferenceField } from '@/pages/user/video/ReferenceField'
import type { useVideoGen } from '@/pages/user/video/useVideoGen'

type Gen = ReturnType<typeof useVideoGen>
type Choice = [value: string, label: string]

const SIZES: Choice[] = [['720p', '720p'], ['1080p', '1080p']]
const RATIOS: Choice[] = [['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1']]
const DURATIONS: Choice[] = [['5', '5 秒'], ['10', '10 秒'], ['15', '15 秒']]

function ChoiceField({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  id: string
  label: string
  value: string
  choices: Choice[]
  onChange: (next: string) => void
}) {
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {choices.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

/** The request form: who and what to call, the prompt, the three output settings, then optional references. */
export function VideoForm({ gen }: { gen: Gen }) {
  const { form, update } = gen
  const disabled = gen.submitting || !form.prompt.trim() || !gen.keyUsable || gen.channels.length === 0

  return (
    <div className='glass flex min-w-0 flex-col gap-5 p-5'>
      <ModelPicker
        idPrefix='video'
        apiKeys={gen.apiKeys}
        channels={gen.channels}
        keyId={gen.keyId}
        channelId={gen.channelId}
        onKey={gen.setKeyId}
        onChannel={gen.setChannelId}
        emptyText='当前没有可用的视频模型渠道。'
      />
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='video-prompt'>
          提示词 <span aria-hidden className='text-muted-foreground'>*</span>
        </Label>
        <Textarea
          id='video-prompt'
          rows={5}
          value={form.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
          placeholder='描述你想生成的视频内容...'
        />
      </div>
      <div className='grid grid-cols-3 gap-3'>
        <ChoiceField id='video-size' label='分辨率档位' value={form.size} choices={SIZES} onChange={(next) => update({ size: next })} />
        <ChoiceField id='video-ratio' label='宽高比' value={form.aspectRatio} choices={RATIOS} onChange={(next) => update({ aspectRatio: next })} />
        <ChoiceField id='video-duration' label='时长' value={form.duration} choices={DURATIONS} onChange={(next) => update({ duration: next })} />
      </div>
      <ReferenceField
        id='video-reference-images'
        kind='image'
        value={form.referenceImages}
        onChange={(next) => update({ referenceImages: next })}
        onAppend={(urls) => gen.appendReferences('referenceImages', urls)}
        onError={gen.setError}
        upload={(file) => userApi.uploadImage(file, 'reference')}
      />
      <ReferenceField
        id='video-reference-videos'
        kind='video'
        value={form.referenceVideos}
        onChange={(next) => update({ referenceVideos: next })}
        onAppend={(urls) => gen.appendReferences('referenceVideos', urls)}
        onError={gen.setError}
        upload={(file) => userApi.uploadVideo(file, 'reference-video')}
      />
      <Button className='w-full' onClick={() => void gen.generate()} disabled={disabled}>
        {gen.submitting ? '生成中...' : '生成视频'}
      </Button>
    </div>
  )
}
