import { lazy, Suspense, useState } from 'react'
import { SaveIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { isThemeColorValueValid, ThemeColorField } from '@/components/shared/ThemeColorField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/hooks/use-async'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { AppearanceTab } from '@/pages/admin/settings/AppearanceTab'
import { BasicTab } from '@/pages/admin/settings/BasicTab'
import { Field, TextRow } from '@/pages/admin/settings/controls'
import { NoticeTab } from '@/pages/admin/settings/NoticeTab'
import { PaymentTab } from '@/pages/admin/settings/PaymentTab'
import { PlansTab } from '@/pages/admin/settings/PlansTab'
import { SettingLogsTab } from '@/pages/admin/settings/SettingLogsTab'
import { AlertTab, RebateTab, VendorTab, WithdrawTab } from '@/pages/admin/settings/SimpleTabs'
import {
  binder,
  buildSettingsPayload,
  parsePlans,
  parseProxyRules,
  ratioToPercentText,
  type PlanRow,
  type ProxyRule,
  type SettingsMap,
} from '@/pages/admin/settings/settingsModel'

const AdminOfficialPricesTab = lazy(() => import('./AdminOfficialPricesTab').then((module) => ({ default: module.AdminOfficialPricesTab })))

const TABS = [
  { value: 'basic', label: '基本设置' },
  { value: 'appearance', label: '页眉&页脚' },
  { value: 'payment', label: '支付设置' },
  { value: 'notice', label: '公告&联系' },
  { value: 'plans', label: '充值套餐' },
  { value: 'rebate', label: '邀请返佣' },
  { value: 'vendor', label: '号商设置' },
  { value: 'withdraw', label: '提现限额' },
  { value: 'alert', label: '告警设置' },
  { value: 'official-prices', label: '官方价' },
  { value: 'logs', label: '操作日志' },
]

/** Platform-wide settings, one tab per concern, saved together. The USD/CNY rate belongs to the official-prices tab and is never sent from here. */
export function AdminSettingsPage() {
  const { updateThemeColor } = useSiteSettings()
  const { data: rawSettings, loading, error: loadError } = useAsync(async () => {
    const res = await adminApi.getSettings()
    const s = (res as { settings?: SettingsMap }).settings ?? (res as SettingsMap)
    return s as SettingsMap
  }, {} as SettingsMap)

  const [form, setForm] = useState<SettingsMap>({})
  const [formReady, setFormReady] = useState(false)
  const [planRows, setPlanRows] = useState<PlanRow[]>([])
  const [proxyRules, setProxyRules] = useState<ProxyRule[]>([])
  const [allowCustom, setAllowCustom] = useState(true)
  const [rebatePercent, setRebatePercent] = useState('')
  const [vendorCommPercent, setVendorCommPercent] = useState('')
  const [mutError, setMutError] = useState('')
  const [saving, setSaving] = useState(false)

  // Fill the form once, from the first settings that arrive.
  if (!loading && !formReady && Object.keys(rawSettings).length > 0) {
    setForm({ ...rawSettings })
    setAllowCustom(rawSettings.recharge_allow_custom !== 'false')
    setRebatePercent(ratioToPercentText(rawSettings.default_rebate_ratio))
    setVendorCommPercent(ratioToPercentText(rawSettings.default_vendor_commission))
    setPlanRows(parsePlans(rawSettings.recharge_plans))
    setProxyRules(parseProxyRules(rawSettings))
    setFormReady(true)
  }

  const error = loadError || mutError
  const themeColorValid = isThemeColorValueValid(form.theme_color ?? '')

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!themeColorValid) return
    setSaving(true)
    setMutError('')
    try {
      const payload = buildSettingsPayload(form, { allowCustom, planRows, rebatePercent, vendorCommPercent, proxyRules })
      for (const key of Object.keys(payload)) {
        if (key.startsWith('usd_cny_exchange_rate')) delete payload[key]
      }
      await adminApi.updateSettings(payload)
      updateThemeColor(form.theme_color ?? '')
      toast.success('系统设置已保存')
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const bind = binder(form, set)

  // These two fields stay here because the page owns the theme validation and the card-address wording; the tabs lay them out.
  const themeField = (
    <Field label='主题颜色'>
      <ThemeColorField value={form.theme_color ?? ''} onChange={(value) => set('theme_color', value)} />
    </Field>
  )
  const cardPurchaseField = (
    <TextRow label='发卡网地址' placeholder='https://card.example.com' hint='填写后用户端「积分充值」会显示购买卡密入口；留空则不显示。' {...bind('card_purchase_url')} />
  )

  return (
    <>
      <PageHeader
        title='系统设置'
        description='配置平台基本信息、支付、公告及充值套餐等全局参数。'
        actions={
          <Button onClick={() => void save()} disabled={saving || loading || !themeColorValid}>
            <SaveIcon data-icon='inline-start' />
            {saving ? '保存中...' : '保存设置'}
          </Button>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className='flex flex-col gap-4'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-9 w-1/3' />
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-9 w-1/2' />
          <Skeleton className='h-24 w-full' />
        </div>
      ) : (
        <Tabs defaultValue='basic'>
          <div className='w-full overflow-x-auto pb-1'>
            <TabsList className='min-w-max justify-start'>
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className='shrink-0'
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value='basic' className='glass mt-5 p-5 sm:p-6'>
            <BasicTab form={form} set={set} theme={themeField} proxyRules={proxyRules} onProxyRules={setProxyRules} />
          </TabsContent>
          <TabsContent value='appearance' className='glass mt-5 p-5 sm:p-6'>
            <AppearanceTab form={form} set={set} />
          </TabsContent>
          <TabsContent value='payment' className='glass mt-5 p-5 sm:p-6'>
            <PaymentTab form={form} set={set} cardPurchase={cardPurchaseField} />
          </TabsContent>
          <TabsContent value='notice' className='glass mt-5 p-5 sm:p-6'>
            <NoticeTab form={form} set={set} />
          </TabsContent>
          <TabsContent value='plans' className='glass mt-5 p-5 sm:p-6'>
            <PlansTab allowCustom={allowCustom} onAllowCustom={setAllowCustom} rows={planRows} onRows={setPlanRows} />
          </TabsContent>
          <TabsContent value='rebate' className='glass mt-5 p-5 sm:p-6'>
            <RebateTab percent={rebatePercent} onPercent={setRebatePercent} />
          </TabsContent>
          <TabsContent value='vendor' className='glass mt-5 p-5 sm:p-6'>
            <VendorTab percent={vendorCommPercent} onPercent={setVendorCommPercent} />
          </TabsContent>
          <TabsContent value='withdraw' className='glass mt-5 p-5 sm:p-6'>
            <WithdrawTab form={form} set={set} />
          </TabsContent>
          <TabsContent value='alert' className='glass mt-5 p-5 sm:p-6'>
            <AlertTab form={form} set={set} />
          </TabsContent>
          <TabsContent value='official-prices' className='mt-5'>
            <Suspense
              fallback={
                <div className='flex flex-col gap-3'>
                  <Skeleton className='h-16 w-full' />
                  <Skeleton className='h-40 w-full' />
                </div>
              }
            >
              <AdminOfficialPricesTab />
            </Suspense>
          </TabsContent>
          <TabsContent value='logs' className='mt-5'>
            <SettingLogsTab />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}
