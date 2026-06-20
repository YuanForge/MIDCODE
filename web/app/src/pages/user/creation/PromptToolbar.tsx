import { useRef } from 'react'
import { ScanSearchIcon, WandSparklesIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/select'
import type { CreationMode } from './constants'

/**
 * 提示词工具栏（纯展示）：LLM 优化、上传图片解析。
 * 行为由父组件注入，便于真实页/预览页分别接真实接口或 mock。
 */
export function PromptToolbar({
  llmChannels,
  selectedLlmId,
  onSelectLlm,
  optimizing,
  onOptimize,
  canUseLlm,
  analyzing,
  onAnalyzeImage,
}: {
  mode: CreationMode
  llmChannels: { id?: number; name?: string }[]
  selectedLlmId?: number
  onSelectLlm: (id: number) => void
  optimizing: boolean
  onOptimize: () => void
  canUseLlm: boolean
  analyzing: boolean
  onAnalyzeImage: (file: File) => void
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const noLlm = llmChannels.length === 0
  const busy = optimizing || analyzing

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        value={selectedLlmId}
        onChange={(e) => onSelectLlm(Number(e.target.value))}
        disabled={noLlm}
        className="h-8 w-auto min-w-[140px] text-xs"
      >
        {noLlm ? (
          <option>无可用 LLM 渠道</option>
        ) : (
          llmChannels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))
        )}
      </NativeSelect>

      <Button size="sm" variant="outline" disabled={busy || noLlm || !canUseLlm} onClick={onOptimize}>
        {optimizing ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <WandSparklesIcon className="size-3.5" />
        )}
        优化提示词
      </Button>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onAnalyzeImage(f)
          e.target.value = ''
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy || noLlm || !canUseLlm}
        onClick={() => imageInputRef.current?.click()}
      >
        {analyzing ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <ScanSearchIcon className="size-3.5" />
        )}
        解析图片
      </Button>
    </div>
  )
}
