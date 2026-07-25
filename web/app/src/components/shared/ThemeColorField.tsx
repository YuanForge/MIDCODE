import { useId } from 'react'
import { RotateCcwIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeBrandColor } from '@/lib/brand-theme'

const DEFAULT_THEME_COLOR = '#4a5be7'

const THEME_PRESETS = [
  { name: '经典靛蓝', value: '#4a5be7' },
  { name: '清晰蓝色', value: '#2563eb' },
  { name: '青绿色', value: '#0f766e' },
  { name: '沉稳紫色', value: '#7c3aed' },
  { name: '暖调琥珀', value: '#b45309' },
] as const

export function isThemeColorValueValid(value: string) {
  return value.trim() === '' || normalizeBrandColor(value) !== null
}

export function ThemeColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const pickerId = useId()
  const inputId = useId()
  const errorId = useId()
  const normalized = normalizeBrandColor(value)
  const invalid = !isThemeColorValueValid(value)
  const previewColor = normalized ?? DEFAULT_THEME_COLOR

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Label
            htmlFor={pickerId}
            className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-background focus-within:ring-3 focus-within:ring-ring/20"
          >
            <span className="absolute inset-1 rounded-md" style={{ backgroundColor: previewColor }} />
            <Input
              id={pickerId}
              aria-label="选择主题颜色"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              type="color"
              value={previewColor}
              onChange={(event) => onChange(event.target.value)}
            />
          </Label>
          <div className="min-w-0">
            <p className="text-sm font-medium">点击色块选择颜色</p>
            <p className="truncate text-xs text-muted-foreground">
              {normalized ? `当前：${normalized.toUpperCase()}` : '当前：使用默认主题'}
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={value.trim() === ''} onClick={() => onChange('')}>
          <RotateCcwIcon data-icon="inline-start" />
          恢复默认
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={inputId}>主题色号</Label>
        <Input
          id={inputId}
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid}
          autoComplete="off"
          inputMode="text"
          placeholder="#4A5BE7"
          spellCheck={false}
          value={value}
          onBlur={() => {
            if (normalized && normalized !== value) onChange(normalized)
          }}
          onChange={(event) => onChange(event.target.value)}
        />
        {invalid ? <p id={errorId} role="alert" className="text-xs text-destructive">请输入 3 位或 6 位十六进制色号，例如 #4A5BE7。</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label>推荐颜色</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEME_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant={normalized === preset.value ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={normalized === preset.value}
              className="justify-start"
              onClick={() => onChange(preset.value)}
            >
              <span className="size-3.5 shrink-0 rounded-full border" style={{ backgroundColor: preset.value }} />
              {preset.name}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">保存后，前台与管理后台会统一使用这个颜色。</p>
    </div>
  )
}
