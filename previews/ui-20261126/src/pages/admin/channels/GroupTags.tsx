import { useState } from 'react'
import { XIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PRESETS = ['高质', '低价', '备用']
const chip = 'inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Tags that group channels. Three presets toggle on and off, and anything typed in becomes a tag of its own. */
export function GroupTags({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const custom = value.filter((tag) => !PRESETS.includes(tag))

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((item) => item !== tag) : [...value, tag])
  }

  function add() {
    const tag = draft.trim()
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }

  return (
    <div className='flex flex-col gap-2 sm:col-span-2'>
      <Label htmlFor='channel-tag-draft'>渠道分组标签</Label>
      <div className='flex flex-wrap items-center gap-2'>
        {PRESETS.map((tag) => {
          const on = value.includes(tag)
          return (
            <button key={tag} type='button' aria-pressed={on} onClick={() => toggle(tag)} className={cn(chip, on ? 'border-primary bg-primary text-primary-foreground' : 'border-glass-border hover:bg-glass-strong')}>
              {tag}
            </button>
          )
        })}
        {custom.map((tag) => (
          <button key={tag} type='button' aria-label={`移除标签 ${tag}`} onClick={() => toggle(tag)} className={cn(chip, 'gap-1 border-transparent bg-secondary text-secondary-foreground')}>
            {tag}
            <XIcon className='size-3' />
          </button>
        ))}
        <Input
          id='channel-tag-draft'
          className='h-8 w-28 text-xs'
          placeholder='自定义标签'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
      </div>
    </div>
  )
}
