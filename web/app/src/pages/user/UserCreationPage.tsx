import { useCallback, useState } from 'react'
import { LightbulbIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImageIcon, HistoryIcon, SparklesIcon, VideoIcon } from 'lucide-react'
import type { CreationMode } from './creation/constants'
import type { CarryOver, ImageParamsState, ReusePayload, VideoParamsState } from './creation/types'
import { splitLines } from './creation/media'
import { useCreationResources } from './creation/useCreationResources'
import { useCreationTask } from './creation/useCreationTask'
import { useCreationHistory } from './creation/useCreationHistory'
import { useCreationLlm } from './creation/useCreationLlm'
import { usePromptHistory } from './creation/usePromptHistory'
import { ParamPanel } from './creation/ParamPanel'
import { ResultPanel } from './creation/ResultPanel'
import { HistoryPanel } from './creation/HistoryPanel'
import { PromptDrawer } from './creation/PromptDrawer'
import { PromptToolbar } from './creation/PromptToolbar'
import { InspirationGallery } from './creation/InspirationGallery'
import { PromptHistoryTab } from './creation/PromptHistoryTab'
import type { GalleryItem } from './creation/inspiration'

const DEFAULT_IMAGE_PARAMS: ImageParamsState = { size: '1k', aspectRatio: '1:1', referenceImages: '' }
const DEFAULT_VIDEO_PARAMS: VideoParamsState = {
  size: '720p',
  aspectRatio: '16:9',
  duration: '5',
  referenceImages: '',
  referenceVideos: '',
}

// 顶部 Tab：图片 / 视频 / 灵感库 / 历史词
const TABS = [
  { key: 'image', label: '图片', icon: ImageIcon },
  { key: 'video', label: '视频', icon: VideoIcon },
  { key: 'gallery', label: '灵感库', icon: SparklesIcon },
  { key: 'history', label: '历史词', icon: HistoryIcon },
] as const
type TabKey = (typeof TABS)[number]['key']

export function UserCreationPage() {
  const [tab, setTab] = useState<TabKey>('image')
  const mode: CreationMode = tab === 'video' ? 'video' : 'image'

  const [prompt, setPrompt] = useState('')
  const [imageParams, setImageParams] = useState<ImageParamsState>(DEFAULT_IMAGE_PARAMS)
  const [videoParams, setVideoParams] = useState<VideoParamsState>(DEFAULT_VIDEO_PARAMS)
  const [carryOver, setCarryOver] = useState<CarryOver | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const resources = useCreationResources(mode)
  const history = useCreationHistory(mode)
  const promptHistory = usePromptHistory()
  const llm = useCreationLlm({
    apiKeys: resources.apiKeys,
    selectedKeyId: resources.selectedKeyId,
    llmChannels: resources.llmChannels,
  })
  const task = useCreationTask({
    apiKeys: resources.apiKeys,
    selectedKeyId: resources.selectedKeyId,
    onDone: () => void history.load(),
  })

  const patchImage = useCallback((patch: Partial<ImageParamsState>) => setImageParams((p) => ({ ...p, ...patch })), [])
  const patchVideo = useCallback((patch: Partial<VideoParamsState>) => setVideoParams((p) => ({ ...p, ...patch })), [])

  function switchTab(next: TabKey) {
    if (next === tab) return
    setTab(next)
    if (next === 'image' || next === 'video') task.reset()
  }

  function handleGenerate() {
    if (!prompt.trim()) return
    const channel = resources.currentChannel
    const model = channel?.routing_model || channel?.name
    promptHistory.add(prompt, mode)

    if (mode === 'image') {
      const refs = splitLines(imageParams.referenceImages)
      const body: Record<string, unknown> = { model, prompt, size: imageParams.size, aspect_ratio: imageParams.aspectRatio }
      if (refs.length > 0) body.refer_images = refs
      void task.generate({ mode, endpoint: '/v1/image', body, channelId: channel?.id })
    } else {
      const refImgs = splitLines(videoParams.referenceImages)
      const refVids = splitLines(videoParams.referenceVideos)
      const body: Record<string, unknown> = {
        model, prompt, size: videoParams.size, aspect_ratio: videoParams.aspectRatio, duration: videoParams.duration,
      }
      if (refImgs.length > 0) body.refer_images = refImgs
      if (refVids.length > 0) body.refer_videos = refVids
      void task.generate({ mode, endpoint: '/v1/video', body, channelId: channel?.id })
    }
  }

  function makeVideo(imageUrl: string, sourcePrompt: string) {
    setTab('video')
    task.reset()
    setCarryOver({ imageUrl, prompt: sourcePrompt })
    setPrompt(sourcePrompt)
    setVideoParams((p) => ({ ...p, referenceImages: imageUrl }))
    toast.success('已切到视频模式，参考图与提示词已带入')
  }

  function reuse(payload: ReusePayload) {
    setTab(payload.mode)
    task.reset()
    setPrompt(payload.prompt)
    if (payload.mode === 'image' && payload.image) setImageParams({ ...DEFAULT_IMAGE_PARAMS, ...payload.image })
    else if (payload.mode === 'video' && payload.video) setVideoParams({ ...DEFAULT_VIDEO_PARAMS, ...payload.video })
    toast.success('已复用参数')
  }

  function useGalleryItem(item: GalleryItem) {
    setTab(item.type)
    task.reset()
    setPrompt(item.text)
    toast.success(`已填入提示词，进入${item.type === 'image' ? '图片' : '视频'}创作`)
  }

  function usePromptFromHistory(text: string, fromMode: CreationMode) {
    setTab(fromMode)
    task.reset()
    setPrompt(text)
    toast.success(`已填入提示词，进入${fromMode === 'image' ? '图片' : '视频'}创作`)
  }

  async function optimize() {
    const result = await llm.optimize(mode, prompt)
    if (result) setPrompt(result)
  }
  async function analyzeImage(file: File) {
    const result = await llm.analyzeImageFile(mode, file)
    if (result) setPrompt(result)
  }

  const canUseLlm = resources.canInvoke

  return (
    <>
      <PageHeader
        eyebrow="Creation"
        title="创作中心"
        description="整合图片与视频生成，支持提示词 AI 优化、素材解析与灵感库。"
        actions={
          tab !== 'gallery' ? (
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
              <LightbulbIcon className="size-4" /> 快速挑词
            </Button>
          ) : null
        }
      />

      <div className="mt-4 flex flex-col gap-4">
        <Tabs value={tab} onValueChange={(v) => switchTab(v as TabKey)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                <t.icon className="size-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {resources.loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{resources.loadError}</AlertDescription>
          </Alert>
        ) : null}

        {tab === 'gallery' ? (
          <InspirationGallery onUse={useGalleryItem} />
        ) : tab === 'history' ? (
          <PromptHistoryTab
            entries={promptHistory.entries}
            onUse={usePromptFromHistory}
            onRemove={promptHistory.remove}
            onClear={promptHistory.clear}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[340px_1fr] 2xl:grid-cols-[340px_1fr_280px]">
            <ParamPanel
              mode={mode}
              apiKeys={resources.apiKeys}
              channels={resources.channels}
              selectedKeyId={resources.selectedKeyId}
              onSelectKey={resources.setSelectedKeyId}
              selectedChannelId={resources.selectedChannelId}
              onSelectChannel={resources.setSelectedChannelId}
              prompt={prompt}
              onPromptChange={setPrompt}
              imageParams={imageParams}
              onImageParamsChange={patchImage}
              videoParams={videoParams}
              onVideoParamsChange={patchVideo}
              carryOver={carryOver}
              onClearCarryOver={() => setCarryOver(null)}
              running={task.running}
              canInvoke={resources.canInvoke}
              onGenerate={handleGenerate}
              promptToolbar={
                <PromptToolbar
                  mode={mode}
                  llmChannels={resources.llmChannels}
                  selectedLlmId={llm.selectedLlmId}
                  onSelectLlm={llm.setSelectedLlmId}
                  optimizing={llm.optimizing}
                  onOptimize={() => void optimize()}
                  canUseLlm={canUseLlm}
                  analyzing={llm.analyzing}
                  onAnalyzeImage={(f) => void analyzeImage(f)}
                />
              }
            />

            <ResultPanel
              mode={mode}
              status={task.status}
              taskId={task.taskId}
              taskError={task.taskError}
              images={task.images}
              videoUrl={task.videoUrl}
              prompt={prompt}
              onRegenerate={handleGenerate}
              onMakeVideo={(url) => makeVideo(url, prompt)}
            />

            <div className="hidden 2xl:block">
              <HistoryPanel
                mode={mode}
                tasks={history.tasks}
                onRefresh={() => void history.load()}
                onClear={() => void history.clear()}
                onReuse={reuse}
                onMakeVideo={makeVideo}
              />
            </div>
          </div>
        )}
      </div>

      <PromptDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={mode}
        prompt={prompt}
        onPromptChange={setPrompt}
      />
    </>
  )
}
