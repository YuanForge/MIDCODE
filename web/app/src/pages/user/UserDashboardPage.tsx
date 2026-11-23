import { useState } from 'react'
import { Link } from 'react-router-dom'
import {

  CheckIcon,
  CopyIcon,
  KeySquareIcon,
  MessageSquareIcon,
  ShoppingCartIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { UsageTrendChart } from '@/components/shared/UsageTrendChart'
import { emptyUsage } from '@/lib/usage-stats'
import { PageSection } from '@/components/shared/PageSection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { copyToClipboard } from '@/lib/clipboard'
import { userApi, type UserStatsResponse } from '@/lib/api/user'
import { formatCredits } from '@/lib/formatters/credits'
import { useAsync } from '@/hooks/use-async'
import { useSiteSettings } from '@/hooks/use-site-settings'

export function UserDashboardPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [balance, stats] = await Promise.all([userApi.getBalance(), userApi.getStats()])
    return {
      balance: balance.balance_credits ?? 0,
      totalConsumed: stats.total_consumed ?? 0,
      todayConsumed: stats.today_consumed ?? 0,
      stats,
    }
  }, { balance: 0, totalConsumed: 0, todayConsumed: 0, stats: {} as UserStatsResponse })

  const [wide, setWide] = useState(false)
  const [days, setDays] = useState(30)
  const usage = useAsync(() => {
    const end = new Date()
    return userApi.getUsageStats({ start_at: new Date(end.getTime() - days * 86400000).toISOString(), end_at: end.toISOString(), bucket: 'day' })
  }, emptyUsage, [days])
  const models = [...(usage.data.models ?? [])].filter(model => model.requests > 0).sort((a,b) => b.requests - a.requests)
  const slices = models.slice(0, 3).map(model => ({ label: model.model, count: model.requests }))
  if (models.length > 3) slices.push({ label: '其他', count: models.slice(3).reduce((sum,model) => sum + model.requests, 0) })
  const total = slices.reduce((sum,item) => sum + item.count, 0)
  const colors = ['#4263ab', '#7192d4', '#a1b8e4', '#cbd7ef']
  let offset = 0
  const stops = slices.map((item, index) => {
    const start = offset
    offset += item.count / total * 100
    return `${colors[index]} ${start}% ${offset}%`
  })
  const { settings } = useSiteSettings()
  const [copied, setCopied] = useState(false)
  const apiBase = typeof window !== 'undefined' ? window.location.origin : ''

  function copyApiBase() {
    if (!apiBase) return
    void copyToClipboard(apiBase, {
      successMessage: '已复制 API 网关地址',
      onSuccess: () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
    })
  }

  return (
    <>
      <PageHeader
        title="开发者工作区"
        actions={error ? <Button size="sm" variant="outline" onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {settings.noticeTitle && (
        <Alert>
          <AlertDescription>
            <strong>{settings.noticeTitle}</strong>
            {settings.noticeContent && (
              <div className="mt-1 whitespace-pre-wrap text-sm">{settings.noticeContent}</div>
            )}
          </AlertDescription>
        </Alert>
      )}
      <section className="monitor-board" data-expanded={wide}>
        <header className="monitor-heading"><h2>调用监控</h2><Button size="sm" variant="outline" aria-pressed={wide} onClick={() => setWide(value => !value)}>{wide ? '退出大屏' : '大屏模式'}</Button></header>
        <div className="overview-grid">
        <Card className="balance-summary overview-balance justify-center"><CardContent className="space-y-4">
          <h2 className="font-semibold">账户余额</h2>
          <div className="flex items-center justify-between gap-2">
            {loading ? <Skeleton className="h-9 w-24" /> : <strong className="text-3xl tabular-nums">¥{formatCredits(data.balance)}</strong>}
            <Button size="sm" asChild><Link to="/billing">充值</Link></Button>
          </div>
          <p className="text-xs text-muted-foreground">今日消耗 ¥{formatCredits(data.todayConsumed)} · 累计消耗 ¥{formatCredits(data.totalConsumed)}</p>
        </CardContent></Card>
        <Card className="monitor-trend"><CardContent>
          <div className="flex items-center justify-between"><h2 className="font-semibold">请求趋势</h2>
            <div className="flex gap-1">{[7,30,90].map(value => <Button key={value} size="sm" variant={days === value ? 'secondary' : 'ghost'} aria-pressed={days === value} onClick={() => setDays(value)}>{value}天</Button>)}</div>
          </div>
          <p className="monitor-reading">{usage.loading || usage.error ? '—' : (usage.data.summary?.requests ?? 0).toLocaleString()} <small>次请求 / 近 {days} 天</small></p>
          {usage.loading ? <Skeleton className="mt-3 h-32" /> : usage.error ? <Button variant="ghost" onClick={usage.reload}>加载失败，重试</Button> : <UsageTrendChart points={usage.data.points ?? []} bucket="day" metric="requests" />}
        </CardContent></Card>
        <Card><CardContent><h2 className="mb-5 font-semibold">用量分布</h2>
          <div className="flex items-center gap-6"><div aria-hidden="true" className="usage-donut" style={{background: stops.length ? `conic-gradient(${stops.join(',')})` : 'var(--muted)'}} />
          <ul className="min-w-0 flex-1 space-y-2">{usage.loading || usage.error || !total ? <li>{usage.loading ? '加载中…' : usage.error ? '用量数据暂不可用' : '暂无请求'}</li> : slices.map((item,i) => <li key={i} className="flex items-center gap-2 text-xs"><span className="size-2 shrink-0 rounded-full" style={{background:colors[i]}} /><span className="truncate" title={item.label}>{item.label}</span><span className="ml-auto">{(item.count/total*100).toFixed(0)}%</span></li>)}</ul></div>
        </CardContent></Card>
        <Card><CardContent><h2 className="mb-5 font-semibold">快速入口</h2><div className="grid grid-cols-3">
          {[{to:'/playground',label:'开始对话',Icon:MessageSquareIcon},{to:'/keys',label:'管理密钥',Icon:KeySquareIcon},{to:'/billing',label:'查看账单',Icon:ShoppingCartIcon}].map(({to,label,Icon}) => <Link key={to} to={to} className="quick-entry grid justify-items-center gap-2 text-sm"><span className="grid size-12 place-items-center rounded-full bg-muted"><Icon className="size-5" /></span>{label}</Link>)}
        </div></CardContent></Card>
      </div>
      </section>
      <PageSection title="API 网关" description="OpenAI 兼容接口使用当前站点地址作为模型基址。">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">本站大模型接口网关：</span>
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{apiBase || '—'}</code>
          <Button size="sm" variant="ghost" onClick={copyApiBase} disabled={!apiBase}>
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            <span className="ml-1">{copied ? '已复制' : '复制'}</span>
          </Button>
          <span className="text-xs text-muted-foreground">
            将模型基址替换为该网关，完全兼容 OpenAI 协议。
          </span>
        </div>
      </PageSection>

      {(settings.contactInfo || settings.qqGroupUrl || settings.wechatCsUrl) && (
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          {settings.contactInfo && (
            <PageSection title="联系方式">
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {settings.contactInfo.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </PageSection>
          )}
          {(settings.qqGroupUrl || settings.wechatCsUrl) && (
            <PageSection title="扫码联系">
              <div className="flex flex-wrap gap-4">
                {settings.qqGroupUrl && (
                  <div className="flex flex-col items-center gap-1">
                    <img src={settings.qqGroupUrl} alt="QQ 交流群" className="h-48 w-48 rounded-lg border object-contain p-1" />
                    <span className="text-xs text-muted-foreground">QQ 交流群</span>
                  </div>
                )}
                {settings.wechatCsUrl && (
                  <div className="flex flex-col items-center gap-1">
                    <img src={settings.wechatCsUrl} alt="微信客服" className="h-48 w-48 rounded-lg border object-contain p-1" />
                    <span className="text-xs text-muted-foreground">微信客服</span>
                  </div>
                )}
              </div>
            </PageSection>
          )}
        </div>
      )}
    </>
  )
}
