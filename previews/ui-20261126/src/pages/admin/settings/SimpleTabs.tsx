import { Alert, AlertDescription } from '@/components/ui/alert'
import { NumberRow, SettingGroup, TextRow } from '@/pages/admin/settings/controls'
import { binder, type SetSetting, type SettingsMap } from '@/pages/admin/settings/settingsModel'

type Props = { form: SettingsMap; set: SetSetting }

/** Invite rebate: the share of an invitee's spending that is frozen for the inviter. */
export function RebateTab({ percent, onPercent }: { percent: string; onPercent: (next: string) => void }) {
  return (
    <div className='flex flex-col gap-6'>
      <Alert>
        <AlertDescription>用户邀请新用户注册后，被邀请人每次消费将按比例给邀请人增加冻结积分，冻结积分可手动解冻为可用积分。</AlertDescription>
      </Alert>
      <SettingGroup title='返佣比例'>
        <NumberRow
          id='setting-default_rebate_ratio'
          label='全局返佣比例（%）'
          value={percent}
          onChange={onPercent}
          min={0}
          max={100}
          step={0.01}
          unit='%'
          hint='被邀请人消费金额的该比例将冻结给邀请人（例：5 表示消费 100 积分返 5 冻结积分）。管理员可为单个用户单独设置比例以覆盖此全局值。'
        />
      </SettingGroup>
    </div>
  )
}

/** Vendors: the share the platform keeps from what a vendor's keys earn. */
export function VendorTab({ percent, onPercent }: { percent: string; onPercent: (next: string) => void }) {
  return (
    <div className='flex flex-col gap-6'>
      <Alert>
        <AlertDescription>号商向号池提供 API Key，每次 Key 被使用时，平台按比例抽成，剩余部分计入号商余额。</AlertDescription>
      </Alert>
      <SettingGroup title='抽成比例'>
        <NumberRow
          id='setting-default_vendor_commission'
          label='全局平台抽成比例（%）'
          value={percent}
          onChange={onPercent}
          min={0}
          max={100}
          step={0.01}
          unit='%'
          hint='平台从号商收益中抽取的比例（例：2 表示号商实得 98%）。可为单个号商单独设置以覆盖此全局值。'
        />
      </SettingGroup>
    </div>
  )
}

/** Task-failure alerts: when one fires, and where it is sent. */
export function AlertTab({ form, set }: Props) {
  const bind = binder(form, set)

  return (
    <div className='flex flex-col gap-6'>
      <Alert>
        <AlertDescription>配置任务失败告警阈值和推送渠道。阈值为 0 表示禁用该告警。</AlertDescription>
      </Alert>
      <SettingGroup title='触发条件'>
        <NumberRow label='失败率告警阈值（%）' min={0} max={100} step={1} unit='%' placeholder='如：30' hint='统计时间窗口内失败率超过此值时触发告警（0 = 禁用）' {...bind('alert_task_failure_rate')} />
        <NumberRow label='统计时间窗口（分钟）' min={1} step={1} unit='分钟' placeholder='如：5' hint='计算失败率所用的滑动时间窗口长度' {...bind('alert_task_window_minutes')} />
      </SettingGroup>
      <SettingGroup title='推送渠道'>
        <TextRow label='企业微信 Webhook URL' placeholder='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…' hint='企业微信群机器人 Webhook 地址，留空不推送' {...bind('alert_webhook_wecom')} />
        <TextRow
          label='Lark Webhook URL'
          placeholder='https://open.larksuite.com/open-apis/bot/v2/hook/...'
          hint='Lark / 飞书群机器人 Webhook 地址；上游余额告警和渠道自动停用通知都会使用它，留空不推送。'
          {...bind('alert_webhook_lark')}
        />
        <TextRow label='告警邮件地址' type='email' placeholder='admin@example.com' hint='接收告警邮件的地址，留空不推送' {...bind('alert_email')} />
      </SettingGroup>
    </div>
  )
}

/** Vendor withdrawal limits. Empty or 0 means no limit. */
export function WithdrawTab({ form, set }: Props) {
  const bind = binder(form, set)

  return (
    <div className='flex flex-col gap-6'>
      <Alert>
        <AlertDescription>配置号商提现的额度限制。留空或 0 表示不限制。所有金额单位为元（CNY）。</AlertDescription>
      </Alert>
      <SettingGroup title='提现额度'>
        <NumberRow label='单笔提现上限（元）' min={0} step={1} unit='元' width='w-40' placeholder='留空不限' hint='单次提现申请金额不得超过此值（例：5000 表示每笔最多 ¥5,000）' {...bind('withdraw_single_limit')} />
        <NumberRow label='单日提现上限（元）' min={0} step={1} unit='元' width='w-40' placeholder='留空不限' hint='同一号商每自然日累计提现不超过此金额' {...bind('withdraw_daily_limit')} />
      </SettingGroup>
      <SettingGroup title='新号商'>
        <NumberRow label='新号商首笔上限（元）' min={0} step={1} unit='元' width='w-40' placeholder='留空不限' hint='号商注册后首笔提现不超过此金额（高风险控制）' {...bind('withdraw_new_vendor_first_limit')} />
        <NumberRow label='新号商保护期（天）' min={0} step={1} unit='天' width='w-40' placeholder='例：30' hint='注册后多少天内视为「新号商」，适用首笔上限规则' {...bind('withdraw_new_vendor_days')} />
      </SettingGroup>
    </div>
  )
}
