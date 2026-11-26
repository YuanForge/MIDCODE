import { TextField } from '@/components/shared/TextField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ActionForm, EditMode } from '@/pages/admin/users/actions'
import { QUICK_AMOUNTS, creditsHint, vipLabel, type VipChoice } from '@/pages/admin/users/userFormat'

function amountHint(value: string) {
  return value.trim() !== '' && Number.isFinite(Number(value)) ? creditsHint(value) : undefined
}

function QuickAmounts({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className='flex gap-2'>
      {QUICK_AMOUNTS.map((item) => (
        <Button key={item.value} type='button' size='sm' variant='outline' onClick={() => onPick(item.value)}>
          {item.label}
        </Button>
      ))}
    </div>
  )
}

/** A VIP tier picker with a line of explanation under it. Used for one account and for a batch. */
export function VipSelect({
  id,
  value,
  onChange,
  choices,
  hint,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  choices: VipChoice[]
  hint: string
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>VIP 等级</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={choices.length > 0 ? '选择 VIP 分组' : '暂无可用的 VIP 分组'} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((group) => (
            <SelectItem key={group.code} value={group.code}>
              {vipLabel(group)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className='text-xs text-muted-foreground'>{hint}</p>
    </div>
  )
}

/** The fields of one action. Which ones show depends on the mode. */
export function ActionFields({
  mode,
  form,
  onChange,
  vipChoices,
}: {
  mode: EditMode
  form: ActionForm
  onChange: (patch: Partial<ActionForm>) => void
  vipChoices: VipChoice[]
}) {
  return (
    <div className='flex flex-col gap-4'>
      {mode === 'recharge' ? (
        <>
          <TextField id='act-amount' label='充值积分数（credits）' value={form.value} onChange={(value) => onChange({ value })} placeholder='如：1000000（= ¥1）' hint={amountHint(form.value)} />
          <QuickAmounts onPick={(value) => onChange({ value })} />
        </>
      ) : null}

      {mode === 'model_credit' ? (
        <>
          <TextField id='act-model' label='模型名称（routing key）' value={form.modelName} onChange={(modelName) => onChange({ modelName })} placeholder='如：gpt-4o' hint='填写用户请求时 model 字段的值（渠道展示名或模型名）' />
          <TextField id='act-credits' label='赠送积分数（credits）' value={form.value} onChange={(value) => onChange({ value })} placeholder='如：1000000（= ¥1）' hint={amountHint(form.value)} />
          <QuickAmounts onPick={(value) => onChange({ value })} />
        </>
      ) : null}

      {mode === 'password' ? (
        <>
          <TextField id='act-password' type='password' label='新密码' value={form.value} onChange={(value) => onChange({ value })} placeholder='至少 8 位' />
          <TextField id='act-confirm' type='password' label='确认密码' value={form.confirm} onChange={(confirm) => onChange({ confirm })} placeholder='再次输入' />
        </>
      ) : null}

      {mode === 'group' ? (
        <VipSelect
          id='act-group'
          value={form.value}
          onChange={(value) => onChange({ value })}
          choices={vipChoices}
          hint='管理员调整 VIP 后，系统会从当前累计充值额重新统计后续升档；用户后续充值或卡密兑换仍会自动升档。'
        />
      ) : null}

      {mode === 'rebate' ? (
        <TextField id='act-rebate' label='个人返佣比例（%）' value={form.rebatePct} onChange={(rebatePct) => onChange({ rebatePct })} placeholder='留空=使用全局默认，如：20（代表 20%）' hint='设置该用户专属的邀请返佣比例，留空则使用系统全局默认值。' />
      ) : null}

      {mode === 'freeze' ? (
        <TextField id='act-reason' label='冻结原因' value={form.reason} onChange={(reason) => onChange({ reason })} placeholder='请输入冻结原因，用户登录时将看到此信息' hint='冻结后用户无法登录，其 API Key 也无法使用。' />
      ) : null}
    </div>
  )
}
