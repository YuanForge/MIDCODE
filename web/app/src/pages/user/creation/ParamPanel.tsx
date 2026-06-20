import { FilmIcon, SparklesIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ApiKeyRecord, UserChannel } from '@/lib/api/user'
import {
  IMAGE_RATIOS,
  IMAGE_SIZES,
  VIDEO_DURATIONS,
  VIDEO_RATIOS,
  VIDEO_RESOLUTIONS,
  type CreationMode,
} from './constants'
import type { CarryOver, ImageParamsState, VideoParamsState } from './types'
import { Field, Segmented } from './controls'
import { ReferenceUploader } from './ReferenceUploader'

export function ParamPanel({
  mode,
  apiKeys,
  channels,
  selectedKeyId,
  onSelectKey,
  selectedChannelId,
  onSelectChannel,
  prompt,
  onPromptChange,
  imageParams,
  onImageParamsChange,
  videoParams,
  onVideoParamsChange,
  carryOver,
  onClearCarryOver,
  running,
  canInvoke,
  onGenerate,
  promptToolbar,
}: {
  mode: CreationMode
  apiKeys: ApiKeyRecord[]
  channels: UserChannel[]
  selectedKeyId?: number
  onSelectKey: (id: number) => void
  selectedChannelId?: number
  onSelectChannel: (id: number) => void
  prompt: string
  onPromptChange: (value: string) => void
  imageParams: ImageParamsState
  onImageParamsChange: (patch: Partial<ImageParamsState>) => void
  videoParams: VideoParamsState
  onVideoParamsChange: (patch: Partial<VideoParamsState>) => void
  carryOver: CarryOver | null
  onClearCarryOver: () => void
  running: boolean
  canInvoke: boolean
  onGenerate: () => void
  promptToolbar?: ReactNode
}) {
  const noChannel = channels.length === 0
  const disabled = running || !prompt.trim() || !canInvoke || noChannel

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <Field
            label="API 密钥"
            required
            hint={<span className="text-xs text-muted-foreground">{apiKeys.length} 个可用</span>}
          >
            <NativeSelect value={selectedKeyId} onChange={(e) => onSelectKey(Number(e.target.value))}>
              {apiKeys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name || key.masked_key || key.key}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="模型 / 渠道">
            <NativeSelect
              value={selectedChannelId}
              onChange={(e) => onSelectChannel(Number(e.target.value))}
              disabled={noChannel}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </NativeSelect>
            {noChannel ? (
              <p className="text-xs text-muted-foreground">该模式暂无可用渠道。</p>
            ) : null}
          </Field>

          <Field label="提示词" required>
            <Textarea
              rows={5}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={mode === 'image'
                ? '描述你想生成的图片内容…'
                : '描述画面与运镜…'}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{prompt.length} 字</span>
              {prompt ? (
                <button type="button" onClick={() => onPromptChange('')} className="hover:text-foreground">
                  清空
                </button>
              ) : null}
            </div>
          </Field>
          {promptToolbar}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          {mode === 'image' ? (
            <>
              <Field label="分辨率档位">
                <NativeSelect
                  value={imageParams.size}
                  onChange={(e) => onImageParamsChange({ size: e.target.value })}
                >
                  {IMAGE_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="宽高比">
                <Segmented
                  options={IMAGE_RATIOS}
                  value={imageParams.aspectRatio}
                  onChange={(v) => onImageParamsChange({ aspectRatio: v })}
                />
              </Field>
              <ReferenceUploader
                kind="image"
                label="参考图（选填，每行一条）"
                value={imageParams.referenceImages}
                onChange={(v) => onImageParamsChange({ referenceImages: v })}
                previews
              />
            </>
          ) : (
            <>
              {carryOver ? (
                <div className="rounded-lg border border-accent/60 bg-accent/10 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-accent-foreground">
                    <FilmIcon className="size-3.5" /> 续作来源 · 图生视频
                    <button
                      type="button"
                      onClick={onClearCarryOver}
                      className="ml-auto font-normal text-muted-foreground hover:text-destructive"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <img src={carryOver.imageUrl} alt="" className="size-14 shrink-0 rounded-md object-cover" />
                    <p className="line-clamp-2 text-xs text-muted-foreground">{carryOver.prompt}</p>
                  </div>
                </div>
              ) : null}

              <Field label="分辨率">
                <Segmented
                  options={VIDEO_RESOLUTIONS}
                  value={videoParams.size}
                  onChange={(v) => onVideoParamsChange({ size: v })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="宽高比">
                  <Segmented
                    options={VIDEO_RATIOS}
                    value={videoParams.aspectRatio}
                    onChange={(v) => onVideoParamsChange({ aspectRatio: v })}
                  />
                </Field>
                <Field label="时长（秒）">
                  <Segmented
                    options={VIDEO_DURATIONS}
                    value={videoParams.duration}
                    onChange={(v) => onVideoParamsChange({ duration: v })}
                    getLabel={(v) => `${v}s`}
                  />
                </Field>
              </div>
              <ReferenceUploader
                kind="image"
                label="参考图（选填，每行一条）"
                value={videoParams.referenceImages}
                onChange={(v) => onVideoParamsChange({ referenceImages: v })}
                previews
              />
              <ReferenceUploader
                kind="video"
                label="参考视频（选填，每行一条）"
                value={videoParams.referenceVideos}
                onChange={(v) => onVideoParamsChange({ referenceVideos: v })}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" disabled={disabled} onClick={onGenerate}>
        {running ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            生成中...
          </>
        ) : (
          <>
            <SparklesIcon className="size-4" />
            {mode === 'image' ? '生成图片' : '生成视频'}
          </>
        )}
      </Button>
    </div>
  )
}
