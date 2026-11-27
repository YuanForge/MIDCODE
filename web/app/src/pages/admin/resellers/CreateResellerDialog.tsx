import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ResellerForm } from '@/pages/admin/resellers/resellerForm'

/** Create a reseller account: who logs in first, then who the reseller is and how to reach them. */
export function CreateResellerDialog({
  open,
  onOpenChange,
  form,
  onField,
  error,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: ResellerForm
  onField: <K extends keyof ResellerForm>(key: K, value: ResellerForm[K]) => void
  error: string
  submitting: boolean
  onSubmit: () => void
}) {
  const text = (key: Exclude<keyof ResellerForm, 'notes'>, label: string, type?: string) => (
    <TextField id={`reseller-${key}`} label={label} type={type} value={form[key]} onChange={(next) => onField(key, next)} />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>新建代理商</DialogTitle>
          <DialogDescription>创建后，代理商可用该账号登录、生成 Key 并搭建代理站。</DialogDescription>
        </DialogHeader>
        <div className='flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1'>
          <FormGroup title='登录账号'>
            {text('username', '用户名')}
            {text('email', '邮箱')}
            {text('password', '密码', 'password')}
          </FormGroup>
          <FormGroup title='代理商资料'>
            {text('name', '代理商名称')}
            {text('contactName', '联系人')}
            {text('phone', '联系电话')}
            <div className='flex flex-col gap-1.5 sm:col-span-2'>
              <Label htmlFor='reseller-notes'>备注</Label>
              <Textarea id='reseller-notes' value={form.notes} onChange={(event) => onField('notes', event.target.value)} />
            </div>
          </FormGroup>
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
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? '创建中...' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
