import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import type { PlatformForm } from '@/pages/admin/ocpc/platformForm'

type StringKey = { [K in keyof PlatformForm]-?: PlatformForm[K] extends string ? K : never }[keyof PlatformForm]
type Option = { value: string; label: string }

const PLATFORMS: Option[] = [
  { value: 'baidu', label: '百度' },
  { value: '360', label: '360' },
]
const REG_TYPES: Option[] = [
  { value: '68', label: '68 - 注册' },
  { value: '25', label: '25 - 表单提交' },
  { value: '3', label: '3 - 咨询' },
]
const ORDER_TYPES: Option[] = [
  { value: '10', label: '10 - 付费' },
  { value: '5', label: '5 - 购买' },
  { value: '6', label: '6 - 下单' },
]
const SO_TYPES: Option[] = [
  { value: '1', label: 'PC 搜索' },
  { value: '2', label: '移动搜索' },
]

function SelectField({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (next: string) => void; options: Option[] }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

/** Add or edit a promotion account. The fields follow the platform: Baidu takes a token and landing page, 360 takes key, secret and event ids. */
export function PlatformDialog({
  open,
  form,
  onField,
  error,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  form: PlatformForm
  onField: <K extends keyof PlatformForm>(key: K, value: PlatformForm[K]) => void
  error: string
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const bind = (key: StringKey) => ({ id: `ocpc-${key}`, value: form[key], onChange: (next: string) => onField(key, next) })
  const isBaidu = form.platform === 'baidu'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{form.id ? '编辑账户' : '新增账户'}</DialogTitle>
          <DialogDescription>填写平台提供的接口凭据，用于把注册和订单转化上报给对应平台。</DialogDescription>
        </DialogHeader>
        <div className='flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1'>
          <FormGroup title='账户'>
            <SelectField id='ocpc-platform' label='平台' value={form.platform} onChange={(next) => onField('platform', next)} options={PLATFORMS} />
            <TextField label='名称' placeholder='账户备注名' {...bind('name')} />
          </FormGroup>
          {isBaidu ? (
            <FormGroup title='百度'>
              <TextField label='百度 Token' placeholder='百度统计 / 转化 API Token' wide {...bind('baidu_token')} />
              <TextField label='落地页 URL' placeholder='https://example.com/landing' wide {...bind('baidu_page_url')} />
              <SelectField id='ocpc-baidu_reg_type' label='注册转化类型' value={form.baidu_reg_type} onChange={(next) => onField('baidu_reg_type', next)} options={REG_TYPES} />
              <SelectField id='ocpc-baidu_order_type' label='订单转化类型' value={form.baidu_order_type} onChange={(next) => onField('baidu_order_type', next)} options={ORDER_TYPES} />
            </FormGroup>
          ) : (
            <FormGroup title='360'>
              <TextField label='360 Key' placeholder='360 推广 API Key' {...bind('e360_key')} />
              <TextField label='360 Secret' placeholder='360 推广 API Secret' {...bind('e360_secret')} />
              <TextField label='jzqs（站点 ID）' placeholder='360 推广站点 ID' {...bind('e360_jzqs')} />
              <SelectField id='ocpc-e360_so_type' label='搜索类型' value={form.e360_so_type} onChange={(next) => onField('e360_so_type', next)} options={SO_TYPES} />
              <TextField label='注册事件 ID' placeholder='360 注册转化事件 ID' {...bind('e360_reg_event')} />
              <TextField label='订单事件 ID' placeholder='360 订单转化事件 ID' {...bind('e360_order_event')} />
            </FormGroup>
          )}
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
