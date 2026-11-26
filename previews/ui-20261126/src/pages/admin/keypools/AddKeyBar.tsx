import { useState } from 'react'

import { TextField } from '@/components/shared/TextField'
import { Button } from '@/components/ui/button'

export type NewKey = { value: string; priority: number; base_url_override?: string }

/** One key at a time: its value, an optional Base URL that overrides the channel's, and its priority. */
export function AddKeyBar({
  importOpen,
  onToggleImport,
  onAdd,
}: {
  importOpen: boolean
  onToggleImport: () => void
  onAdd: (key: NewKey) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [priority, setPriority] = useState('0')
  const [adding, setAdding] = useState(false)

  async function submit() {
    setAdding(true)
    const ok = await onAdd({ value: value.trim(), priority: Number(priority || '0'), base_url_override: baseUrl.trim() || undefined })
    setAdding(false)
    if (ok) {
      setValue('')
      setBaseUrl('')
      setPriority('0')
    }
  }

  return (
    <div className='grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_6rem_auto]'>
      <TextField id='pool-key-value' label='Key 值' placeholder='Key 值' value={value} onChange={setValue} />
      <TextField
        id='pool-key-base-url'
        label='Base URL（可选）'
        placeholder='https://api.example.com/v1/images/generations'
        value={baseUrl}
        onChange={setBaseUrl}
      />
      <TextField id='pool-key-priority' label='优先级' type='number' value={priority} onChange={setPriority} />
      <div className='flex gap-2'>
        <Button onClick={() => void submit()} disabled={adding || !value.trim()}>
          {adding ? '添加中...' : '添加 Key'}
        </Button>
        <Button variant='outline' onClick={onToggleImport} aria-expanded={importOpen}>
          批量导入
        </Button>
      </div>
    </div>
  )
}
