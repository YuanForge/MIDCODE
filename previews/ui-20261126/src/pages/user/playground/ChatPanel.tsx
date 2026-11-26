import { useEffect, useRef } from 'react'

import { MessageContent } from '@/components/shared/MessageContent'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Message } from '@/pages/user/playground/types'

function Turn({ role, content, live }: { role: Message['role']; content: string; live?: boolean }) {
  if (role === 'user') {
    return (
      <div className='flex justify-end'>
        <div className='max-w-[88%] rounded-lg bg-primary px-4 py-3 text-sm leading-7 text-primary-foreground md:max-w-[80%]'>
          <MessageContent content={content} role='user' />
        </div>
      </div>
    )
  }
  return (
    <div className={cn('max-w-[92%] border-l-2 pl-4 text-sm leading-7 text-foreground', live ? 'border-brand' : 'border-glass-border')}>
      <MessageContent content={content} role='assistant' />
    </div>
  )
}

/** The transcript: your messages as bubbles, the model's replies as plain text on a rule. It follows the newest text. */
export function ChatThread({
  messages,
  streaming,
  streamingText,
}: {
  messages: Message[]
  streaming: boolean
  streamingText: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingText])

  return (
    <div
      ref={scrollRef}
      role='log'
      aria-label='对话内容'
      className='flex min-h-0 flex-1 flex-col gap-6 overflow-auto overscroll-contain py-1 pr-1'
    >
      {messages.length === 0 && !streaming ? (
        <div className='flex min-h-[300px] items-center justify-center text-sm text-muted-foreground'>开始一段对话吧。</div>
      ) : null}
      {messages.map((message, index) => (
        <Turn key={`${message.role}-${index}`} role={message.role} content={message.content} />
      ))}
      {streaming && streamingText ? <Turn role='assistant' content={streamingText} live /> : null}
    </div>
  )
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  sendDisabled,
  keyUnavailable,
}: {
  value: string
  onChange: (next: string) => void
  onSend: () => void
  onStop: () => void
  streaming: boolean
  sendDisabled: boolean
  keyUnavailable: boolean
}) {
  return (
    <div className='shrink-0 border-t border-glass-border pt-4'>
      <div className='flex flex-col gap-3 sm:flex-row'>
        <Textarea
          className='min-h-24 min-w-0 flex-1 resize-none'
          aria-label='消息输入框'
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder='输入消息，Enter 发送'
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              onSend()
            }
          }}
        />
        <div className='flex flex-col items-stretch gap-1 sm:items-end'>
          <Button onClick={streaming ? onStop : onSend} disabled={sendDisabled}>
            {streaming ? '停止生成' : '发送'}
          </Button>
          {keyUnavailable ? <p className='text-xs text-destructive'>所选密钥不可用，请重新选择</p> : null}
        </div>
      </div>
    </div>
  )
}
