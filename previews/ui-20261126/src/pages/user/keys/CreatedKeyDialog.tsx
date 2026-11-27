import { CCSwitchImport } from '../CCSwitchImport'
import { TriangleAlertIcon } from 'lucide-react'

import { CopyButton } from '@/components/shared/CopyButton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Shown once, right after a key is created. The plaintext key sits on a dark code surface with its own
 * copy control. The footer button is named 关闭 (the e2e suite closes the dialog through it).
 */
export function CreatedKeyDialog({
  createdKey,
  onClose,
  onCopy,
}: {
  createdKey: string
  onClose: () => void
  onCopy: (text: string) => void
}) {
  return (
    <Dialog open={Boolean(createdKey)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>密钥已创建</DialogTitle>
          <DialogDescription>请立即复制保存，这个明文值后续不会再次展示。</DialogDescription>
        </DialogHeader>
        <div className='flex items-start gap-2 rounded-lg border border-code-border bg-code py-2 pr-2 pl-3.5'>
          <code className='min-w-0 flex-1 py-1 font-mono text-[13px] leading-6 break-all text-code-foreground'>{createdKey}</code>
          <CopyButton
            value={createdKey}
            label='复制'
            successMessage='密钥已复制'
            className='text-code-muted hover:bg-white/8 hover:text-code-foreground'
          />
        </div>
        <Alert variant='warning'>
          <TriangleAlertIcon />
          <AlertDescription>关闭此窗口后无法再查看完整密钥，如遗失只能删除后重新创建。</AlertDescription>
        </Alert>
        <DialogFooter>
          <CCSwitchImport keys={[{ id: "new", name: "刚创建的密钥", key: createdKey }]} selectedId="new" />
          <Button variant='outline' onClick={onClose}>
            关闭
          </Button>
          <Button onClick={() => onCopy(createdKey)}>复制密钥</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
