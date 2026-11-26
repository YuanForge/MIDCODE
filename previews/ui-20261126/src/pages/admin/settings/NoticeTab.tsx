import { AreaRow, ImageRow, SettingGroup, TextRow } from '@/pages/admin/settings/controls'
import { binder, type SetSetting, type SettingsMap } from '@/pages/admin/settings/settingsModel'

const CONTACT_SAMPLE = ['微信：midcode', 'QQ群：123456789', '邮箱：support@example.com'].join('\n')
const TUTORIAL_SAMPLE = ['# 新手教程', '', '在这里粘贴完整的 Markdown 教程文档。'].join('\n')

/** What users read on the dashboard and how they reach support: the notice, contact lines, the tutorial and three QR images. */
export function NoticeTab({ form, set }: { form: SettingsMap; set: SetSetting }) {
  const bind = binder(form, set)

  return (
    <div className='flex flex-col gap-8'>
      <SettingGroup title='公告'>
        <TextRow label='公告标题' placeholder='例如：📢 最新公告' hint='显示在用户数据看板右侧，留空则不显示公告模块' {...bind('notice_title')} />
        <AreaRow label='公告内容' rows={5} placeholder='支持换行，每行一条公告内容' hint='纯文本，每行作为一条，不支持 HTML' {...bind('notice_content')} />
      </SettingGroup>

      <SettingGroup title='联系方式'>
        <AreaRow label='联系方式' rows={4} placeholder={CONTACT_SAMPLE} hint='纯文本，每行一条联系方式，显示在数据看板公告区域' {...bind('contact_info')} />
        <ImageRow label='QQ 交流群二维码' placeholder='图片 URL' previewAlt='QQ群二维码' hint='填写后用户页面头部将显示「QQ交流群」按钮，留空不显示' {...bind('qq_group_url')} />
        <ImageRow label='微信客服二维码' placeholder='图片 URL' previewAlt='微信客服' hint='填写后用户页面头部将显示「微信客服」按钮，留空不显示' {...bind('wechat_cs_url')} />
        <ImageRow label='二维码图片' placeholder='图片 URL' previewAlt='二维码' hint='支持图片 URL 或本地上传后自动转线上 URL；留空则不显示' {...bind('qrcode_url')} />
      </SettingGroup>

      <SettingGroup title='新手教程'>
        <AreaRow label='新手教程 Markdown' rows={16} kind='large' placeholder={TUTORIAL_SAMPLE} hint='用户端左侧「新手教程」页面会直接展示这里的 Markdown 内容。' {...bind('tutorial_markdown')} />
      </SettingGroup>
    </div>
  )
}
