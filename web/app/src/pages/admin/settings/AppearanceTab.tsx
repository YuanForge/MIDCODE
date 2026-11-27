import { Alert, AlertDescription } from '@/components/ui/alert'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { AreaRow, Field } from '@/pages/admin/settings/controls'
import { binder, type SetSetting, type SettingsMap } from '@/pages/admin/settings/settingsModel'

const HEADER_SAMPLE = `<div style='text-align:center;padding:8px;background:#1677ff;color:#fff'>公告：系统维护中</div>`
const FOOTER_SAMPLE = `<div style='text-align:center;padding:16px;color:#888'>© 2025 MidCode</div>`
const EMPTY_PREVIEW = `<span style='color:#aaa'>（空）</span>`

/** Free HTML above and below every page, with a sanitised preview of what it will look like. */
export function AppearanceTab({ form, set }: { form: SettingsMap; set: SetSetting }) {
  const bind = binder(form, set)
  const hasPreview = Boolean(form.header_html || form.footer_html)

  return (
    <div className='flex flex-col gap-6'>
      <Alert variant='warning'>
        <AlertDescription>
          安全提示：页眉/页脚内容直接通过 <code>dangerouslySetInnerHTML</code> 渲染，请勿插入不可信的第三方脚本，避免 XSS 风险。
        </AlertDescription>
      </Alert>
      <div className='flex flex-col'>
        <AreaRow label='页眉 HTML' rows={6} kind='code' placeholder={HEADER_SAMPLE} hint='留空则不显示页眉；支持 HTML 和内联样式' {...bind('header_html')} />
        <AreaRow label='页脚 HTML' rows={6} kind='code' placeholder={FOOTER_SAMPLE} hint='留空则不显示页脚；支持 HTML 和内联样式' {...bind('footer_html')} />
        {hasPreview ? (
          <Field label='预览'>
            <div className='overflow-hidden rounded-xl border border-glass-border'>
              <p className='bg-glass-strong/50 px-3 py-1.5 text-xs text-muted-foreground'>页眉预览</p>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.header_html || EMPTY_PREVIEW) }} />
              <p className='border-t border-glass-border bg-glass-strong/50 px-3 py-1.5 text-xs text-muted-foreground'>页脚预览</p>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.footer_html || EMPTY_PREVIEW) }} />
            </div>
          </Field>
        ) : null}
      </div>
    </div>
  )
}
