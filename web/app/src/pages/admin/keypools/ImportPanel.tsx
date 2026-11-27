import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseKeyLines } from '@/pages/admin/keypools/poolFormat'

export type ImportResult = { imported: number; skipped: number }

/** Paste many keys at once. Duplicates are skipped by the server, and the count of each is shown afterwards. */
export function ImportPanel({
  onImport,
  onClose,
}: {
  onImport: (lines: string[]) => Promise<ImportResult | null>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function submit() {
    setImporting(true)
    const res = await onImport(parseKeyLines(text))
    setImporting(false)
    if (res) {
      setResult(res)
      setText('')
    }
  }

  return (
    <div className='glass flex flex-col gap-2 p-4'>
      <Label htmlFor='pool-import-text'>批量导入</Label>
      <p className='text-sm text-muted-foreground'>每行或逗号分隔填写 Key 值，重复的自动跳过。</p>
      <Textarea id='pool-import-text' rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder='每行一个 Key，或用逗号分隔' />
      {result ? (
        <p className='text-sm tabular-nums text-muted-foreground'>
          已导入 {result.imported} 条，跳过 {result.skipped} 条。
        </p>
      ) : null}
      <div className='flex gap-2'>
        <Button size='sm' onClick={() => void submit()} disabled={importing || !text.trim()}>
          {importing ? '导入中…' : '确认导入'}
        </Button>
        <Button size='sm' variant='outline' onClick={onClose}>
          收起
        </Button>
      </div>
    </div>
  )
}
