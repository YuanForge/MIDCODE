import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProviderForm } from '@/pages/admin/providers/providerForm'

/** Create or edit a model provider. The code is its stable identity, so it locks once anything refers to it. Errors stay in the dialog. */
export function ProviderDialog({
  open,
  onOpenChange,
  form,
  onField,
  codeLocked,
  error,
  saving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: ProviderForm
  onField: <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) => void
  codeLocked: boolean
  error: string
  saving: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? '编辑企业' : '新建企业'}</DialogTitle>
          <DialogDescription>企业编码将作为稳定标识；产生分组或渠道引用后不能修改。</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='provider-code'>企业编码</Label>
            <Input id='provider-code' value={form.code} disabled={codeLocked} onChange={(event) => onField('code', event.target.value)} placeholder='openai' />
            {codeLocked ? <p className='text-xs text-muted-foreground'>已有分组或渠道引用，编码不能修改。</p> : null}
          </div>
          <TextField id='provider-name' label='显示名称' placeholder='OpenAI' value={form.name} onChange={(next) => onField('name', next)} />
          <TextField id='provider-sort' label='排序' type='number' min={0} step='1' value={form.sort_order} onChange={(next) => onField('sort_order', next)} />
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
