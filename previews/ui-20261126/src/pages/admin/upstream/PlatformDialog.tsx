import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import type { PlatformForm } from '@/pages/admin/upstream/platformForm'

type TextKey = Exclude<keyof PlatformForm, 'is_active'>

/** Add or edit an upstream platform: where it is, how its balance is read, and when to be told it is low. Errors stay in the dialog. */
export function PlatformDialog({
  open,
  isEdit,
  form,
  onField,
  error,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  isEdit: boolean
  form: PlatformForm
  onField: <K extends keyof PlatformForm>(key: K, value: PlatformForm[K]) => void
  error: string
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const bind = (key: TextKey) => ({ id: `upstream-${key}`, value: form[key], onChange: (next: string) => onField(key, next) })
  const sub2 = form.platform_type === 'sub2api'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑上游平台' : '添加上游平台'}</DialogTitle>
          <DialogDescription>这里保存余额检测所需的账户信息；渠道成本同步在渠道编辑弹窗里操作。</DialogDescription>
        </DialogHeader>
        <div className='flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1'>
          <FormGroup title='平台'>
            <TextField label='名称' placeholder='zzshu' {...bind('name')} />
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='upstream-platform_type'>平台类型</Label>
              <NativeSelect id='upstream-platform_type' value={form.platform_type} onChange={(event) => onField('platform_type', event.target.value)}>
                <option value='newapi'>zzshu / New API</option>
                <option value='sub2api'>modelboxs / Sub2API</option>
                <option value='openai'>OpenAI 兼容</option>
              </NativeSelect>
            </div>
            <TextField label='Base URL' placeholder='https://us.zzshu.cc' wide {...bind('base_url')} />
          </FormGroup>
          <FormGroup title='余额自动同步与告警'>
            <p className='text-xs text-muted-foreground sm:col-span-2'>后台每 10 秒自动同步一次余额；余额小于等于阈值时通过 Lark 通知，阈值留空或 0 表示关闭。</p>
            <TextField label='余额 API Key（可选）' type='password' placeholder={isEdit ? '留空不修改' : 'sk-...'} {...bind('api_key')} />
            <TextField
              label={sub2 ? '控制台 JWT（可选）' : '系统访问令牌（可选）'}
              type='password'
              placeholder={isEdit ? '留空不修改' : sub2 ? 'eyJ...' : 'token'}
              {...bind('system_token')}
            />
            <TextField label='上游用户 ID（New API 余额可选）' placeholder='New-Api-User' {...bind('upstream_user_id')} />
            <TextField
              label='低余额告警阈值'
              type='number'
              min={0}
              step='0.0001'
              placeholder='0 = 关闭告警'
              hint='单位跟当前余额币种一致，例如 USD 余额填 300 表示 USD <= 300 告警。'
              {...bind('balance_alert_threshold')}
            />
          </FormGroup>
          <FormGroup title='备注与状态'>
            <TextField label='备注' wide {...bind('note')} />
            <label className='flex items-center gap-2 text-sm sm:col-span-2'>
              <Checkbox checked={form.is_active} onCheckedChange={(value) => onField('is_active', value === true)} />
              启用
            </label>
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
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
