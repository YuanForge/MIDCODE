import type { ReactNode } from 'react'
import { XIcon } from 'lucide-react'

import { Section } from '@/components/shared/Section'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ChatConversation } from '@/lib/api/user'
import { cn } from '@/lib/utils'
import type { ChatParams } from '@/pages/user/playground/types'

function Optional({
  id,
  label,
  checked,
  onChecked,
  children,
}: {
  id: string
  label: string
  checked: boolean
  onChecked: (next: boolean) => void
  children: ReactNode
}) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor={id}>
          {label} <span className='font-normal text-muted-foreground'>(选填)</span>
        </Label>
        <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChecked(next === true)} />
      </div>
      {checked ? children : null}
    </div>
  )
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className='flex items-center gap-3'>
      <input
        type='range'
        aria-label={label}
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className='flex-1 accent-brand'
      />
      <span className='w-12 text-right font-mono text-xs tabular-nums'>{value.toFixed(2)}</span>
    </div>
  )
}

/** Request parameters. Everything except the system prompt is optional and only sent when it is switched on or filled in. */
export function ChatParamsPanel({
  params,
  onChange,
}: {
  params: ChatParams
  onChange: (patch: Partial<ChatParams>) => void
}) {
  return (
    <Section title='参数' panel>
      <div className='flex flex-col gap-5'>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='playground-system'>系统提示词</Label>
          <Textarea
            id='playground-system'
            value={params.systemPrompt}
            onChange={(event) => onChange({ systemPrompt: event.target.value })}
            placeholder='例如：你是一个专业的 AI 助手'
          />
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='playground-max-tokens'>
            Max Tokens <span className='font-normal text-muted-foreground'>(选填)</span>
          </Label>
          <Input
            id='playground-max-tokens'
            type='number'
            inputMode='numeric'
            min={1}
            max={128000}
            value={params.maxTokens}
            onChange={(event) => onChange({ maxTokens: event.target.value })}
            placeholder='不填则不限制'
          />
        </div>
        <Optional
          id='playground-temperature'
          label='Temperature'
          checked={params.useTemp}
          onChecked={(next) => onChange({ useTemp: next })}
        >
          <Slider label='Temperature' min={0} max={2} value={params.temperature} onChange={(next) => onChange({ temperature: next })} />
        </Optional>
        <Optional
          id='playground-top-p'
          label='Top P'
          checked={params.useTopP}
          onChecked={(next) => onChange({ useTopP: next })}
        >
          <Slider label='Top P' min={0} max={1} value={params.topP} onChange={(next) => onChange({ topP: next })} />
        </Optional>
      </div>
    </Section>
  )
}

/** Saved text conversations as a ruled list. The open one carries the brand edge. */
export function ConversationList({
  items,
  currentId,
  disabled,
  onOpen,
  onDelete,
  onRefresh,
}: {
  items: ChatConversation[]
  currentId: number | undefined
  disabled: boolean
  onOpen: (conv: ChatConversation) => void
  onDelete: (id: number) => void
  onRefresh: () => void
}) {
  return (
    <Section
      title='历史对话'
      panel
      actions={
        <Button variant='ghost' size='sm' onClick={onRefresh}>
          刷新
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className='py-6 text-center text-xs text-muted-foreground'>暂无历史对话</p>
      ) : (
        <ul className='max-h-80 divide-y divide-glass-border overflow-y-auto border-y border-glass-border'>
          {items.map((conv) => (
            <li
              key={conv.id}
              className={cn('group flex items-center gap-1', currentId === conv.id && 'bg-glass-strong shadow-[inset_2px_0_0_var(--brand)]')}
            >
              <button
                type='button'
                disabled={disabled}
                aria-current={currentId === conv.id ? 'true' : undefined}
                onClick={() => onOpen(conv)}
                className='flex min-h-10 min-w-0 flex-1 items-center px-3 py-2 text-left text-xs leading-snug outline-none hover:bg-glass-strong/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60'
              >
                <span className='truncate'>{conv.title}</span>
              </button>
              <button
                type='button'
                disabled={disabled}
                onClick={() => onDelete(conv.id)}
                aria-label={`删除历史对话 ${conv.title}`}
                className='mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100'
              >
                <XIcon className='size-4' />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
