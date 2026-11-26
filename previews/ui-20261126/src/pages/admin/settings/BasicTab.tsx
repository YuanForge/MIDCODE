import type { ReactNode } from 'react'

import { AreaRow, Field, ImageRow, SettingGroup, TextRow, ToggleRow } from '@/pages/admin/settings/controls'
import { ProxyRulesEditor } from '@/pages/admin/settings/ProxyRulesEditor'
import { binder, type ProxyRule, type SetSetting, type SettingsMap } from '@/pages/admin/settings/settingsModel'

const AGREEMENT_SAMPLE = ['# 用户协议', '', '在这里编辑登录页展示的用户协议内容，支持 Markdown。'].join('\n')

/** Site identity, search-engine text, result-link proxying and the sign-in agreement. The theme colour field comes from the page, which owns its validation. */
export function BasicTab({
  form,
  set,
  theme,
  proxyRules,
  onProxyRules,
}: {
  form: SettingsMap
  set: SetSetting
  theme: ReactNode
  proxyRules: ProxyRule[]
  onProxyRules: (next: ProxyRule[]) => void
}) {
  const bind = binder(form, set)

  return (
    <div className='flex flex-col gap-8'>
      <SettingGroup title='站点'>
        <TextRow label='站点名称' placeholder='例如：MidCode' hint='显示在浏览器标题栏和页面 Logo 旁；如果 env.js 配置了 site_name，则前台展示会优先使用 env.js' {...bind('site_name')} />
        {theme}
        <ImageRow
          label='Logo 图片'
          placeholder='https://example.com/logo.png（留空则显示文字）'
          previewAlt='Logo'
          previewClass='size-20'
          hint='支持手填 URL 或本地上传 PNG / SVG，建议尺寸 32×32 或 64×64；如果 env.js 配置了 logo_url，则前台展示会优先使用 env.js'
          {...bind('logo_url')}
        />
      </SettingGroup>

      <SettingGroup title='搜索引擎'>
        <TextRow label='SEO 标题' placeholder='留空则使用站点名称' hint='用于浏览器标题和搜索引擎标题。' {...bind('seo_title')} />
        <AreaRow label='SEO 描述' rows={3} placeholder='描述本站提供的模型与 API 服务' hint='用于页面 description 元标签，按纯文本保存。' {...bind('seo_description')} />
      </SettingGroup>

      <SettingGroup title='任务结果'>
        <Field label='任务结果 URL 反代规则' hint='配置多个上游资源域名→反代前缀的替换规则，用户端和管理端任务结果统一生效。留空则不替换。'>
          <ProxyRulesEditor rules={proxyRules} onChange={onProxyRules} />
        </Field>
      </SettingGroup>

      <SettingGroup title='用户协议'>
        <TextRow
          label='用户协议地址'
          type='url'
          placeholder='https://example.com/terms'
          hint='登录页的「用户协议」外链地址；若下方填写了本地协议内容，登录页将优先弹窗展示本地内容。'
          {...bind('user_agreement_url')}
        />
        <AreaRow
          label='本地用户协议内容'
          rows={10}
          kind='large'
          placeholder={AGREEMENT_SAMPLE}
          hint='支持 Markdown；留空时登录页使用上方协议地址，若两者都为空则仅显示确认文字。'
          {...bind('user_agreement_content')}
        />
      </SettingGroup>

      <SettingGroup title='用户端选项'>
        <ToggleRow
          id='setting-show_low_price_key'
          label='显示低价密钥类型'
          hint='关闭后，用户创建 API 密钥时将不显示「低价密钥」选项'
          checked={form.show_low_price_key !== 'false'}
          onChange={(on) => set('show_low_price_key', on ? 'true' : 'false')}
        />
      </SettingGroup>
    </div>
  )
}
