import { adminApi, type AdminUser } from '@/lib/api/admin'

export type ActionMode = 'recharge' | 'password' | 'group' | 'rebate' | 'model_credit' | 'freeze' | 'delete'

/** Every action that has a form. Deleting only asks for a yes, so it is not one of these. */
export type EditMode = Exclude<ActionMode, 'delete'>

export type BatchAction = 'freeze' | 'unfreeze' | 'set_group'

export const ACTION_TITLES: Record<EditMode, string> = {
  recharge: '手动充值',
  password: '重置密码',
  group: '设置 VIP 等级',
  rebate: '设置返佣比例',
  model_credit: '赠送专属模型积分',
  freeze: '冻结账户',
}

export type ActionForm = {
  value: string
  confirm: string
  rebatePct: string
  modelName: string
  reason: string
}

/** The form starts from what the account has now: its tier, its rebate ratio, a ¥1 top-up. */
export function initialActionForm(mode: EditMode, user: AdminUser): ActionForm {
  const ratio = user.rebate_ratio
  return {
    value: mode === 'group' ? (user.group ?? '') : mode === 'recharge' ? '1000000' : '',
    confirm: '',
    rebatePct: mode === 'rebate' && ratio != null ? String(parseFloat((ratio * 100).toFixed(2))) : '',
    modelName: '',
    reason: '',
  }
}

/** Returns what is wrong with the form, or an empty string when it can be sent. */
export function validateAction(mode: EditMode, form: ActionForm): string {
  const amount = Number(form.value)
  const hasAmount = form.value.trim() !== '' && Number.isFinite(amount)
  if (mode === 'recharge' && (!hasAmount || amount === 0)) return '请输入充值积分数'
  if (mode === 'model_credit') {
    if (!form.modelName.trim()) return '请填写模型名称'
    if (!hasAmount || amount <= 0) return '请输入大于 0 的积分数'
  }
  if (mode === 'password') {
    if (!form.value) return '请输入新密码'
    if (form.value !== form.confirm) return '两次密码不一致'
  }
  if (mode === 'group' && !form.value) return '请选择 VIP 分组'
  if (mode === 'rebate' && form.rebatePct.trim() !== '') {
    const pct = parseFloat(form.rebatePct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return '返佣比例需在 0 到 100 之间'
  }
  return ''
}

export async function runAction(mode: EditMode, id: number, form: ActionForm): Promise<void> {
  if (mode === 'recharge') {
    await adminApi.rechargeUser(id, Number(form.value))
  } else if (mode === 'password') {
    await adminApi.resetUserPassword(id, form.value)
  } else if (mode === 'group') {
    await adminApi.setUserVipGroup(id, form.value)
  } else if (mode === 'rebate') {
    const ratio = form.rebatePct.trim() === '' ? null : parseFloat(form.rebatePct) / 100
    await adminApi.setUserRebateRatio(id, ratio)
  } else if (mode === 'model_credit') {
    await adminApi.grantModelCredit(id, { model_name: form.modelName.trim(), credits: Number(form.value) })
  } else {
    await adminApi.freezeUser(id, true, form.reason)
  }
}

/** One request for many accounts. Only the field the action uses is sent. */
export async function runBatch(action: BatchAction, ids: number[], extra: { group?: string; reason?: string } = {}): Promise<void> {
  await adminApi.batchUpdateUsers({
    action,
    ids,
    group: action === 'set_group' ? extra.group : undefined,
    reason: action === 'freeze' ? extra.reason : undefined,
  })
}
