import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ModelPicker } from '@/pages/user/gen/ModelPicker'
import type { MusicMode } from '@/pages/user/music/musicModel'
import type { useMusicGen } from '@/pages/user/music/useMusicGen'

type Gen = ReturnType<typeof useMusicGen>

function Optional({ children }: { children: string }) {
  return (
    <>
      {children} <span className='font-normal text-muted-foreground'>(选填)</span>
    </>
  )
}

/** The request form: who and what to call, the creation mode, then the fields that mode needs. */
export function MusicForm({ gen }: { gen: Gen }) {
  const { form, update } = gen
  const disabled = gen.submitting || !gen.keyUsable || gen.channels.length === 0

  return (
    <div className='glass flex min-w-0 flex-col gap-5 p-5'>
      <ModelPicker
        idPrefix='music'
        apiKeys={gen.apiKeys}
        channels={gen.channels}
        keyId={gen.keyId}
        channelId={gen.channelId}
        onKey={gen.setKeyId}
        onChannel={gen.setChannelId}
        emptyText='当前没有可用的音乐模型渠道。'
      />

      <div className='flex flex-col gap-1.5'>
        <span id='music-mode-label' className='text-sm leading-none font-medium'>
          创作模式
        </span>
        <Tabs value={form.mode} onValueChange={(next) => update({ mode: next as MusicMode })}>
          <TabsList aria-labelledby='music-mode-label' className='w-full'>
            <TabsTrigger value='10'>灵感模式</TabsTrigger>
            <TabsTrigger value='20'>自定义模式</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {form.mode === '10' ? (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='music-description'>
            灵感描述 <span aria-hidden className='text-muted-foreground'>*</span>
          </Label>
          <Textarea
            id='music-description'
            rows={5}
            value={form.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder='例如：一首轻快的电子流行乐，节奏明快'
          />
        </div>
      ) : (
        <>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='music-lyrics'>
              <Optional>歌词</Optional>
            </Label>
            <Textarea
              id='music-lyrics'
              rows={4}
              value={form.lyrics}
              onChange={(event) => update({ lyrics: event.target.value })}
              placeholder='填写歌词内容，支持 [Verse]/[Chorus] 等标记'
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='music-tags'>
              <Optional>风格标签</Optional>
            </Label>
            <Input
              id='music-tags'
              value={form.tags}
              onChange={(event) => update({ tags: event.target.value })}
              placeholder='如：pop, female voice, upbeat'
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='music-title'>
              <Optional>歌曲标题</Optional>
            </Label>
            <Input
              id='music-title'
              value={form.title}
              onChange={(event) => update({ title: event.target.value })}
              placeholder='歌曲名称'
            />
          </div>
        </>
      )}

      <div className='flex items-center gap-2'>
        <Checkbox
          id='music-instrumental'
          checked={form.instrumental}
          onCheckedChange={(next) => update({ instrumental: next === true })}
        />
        <Label htmlFor='music-instrumental' className='cursor-pointer text-sm font-normal'>
          纯音乐（无人声）
        </Label>
      </div>

      <Button className='w-full' onClick={() => void gen.generate()} disabled={disabled}>
        {gen.submitting ? '生成中...' : '生成音乐'}
      </Button>
    </div>
  )
}
