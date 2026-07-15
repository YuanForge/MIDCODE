import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRightIcon,
  BlocksIcon,
  CheckIcon,
  CopyIcon,
  KeySquareIcon,
  MessageSquareIcon,
  ImageIcon,
  ShoppingCartIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
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

type GuideStep = {
  num: number
  text: string
  to: string
  Icon: React.ComponentType<{ className?: string }>
}

const guideSteps: GuideStep[] = [
  { num: 1, text: '点击左侧【API 密钥】创建密钥', to: '/keys', Icon: KeySquareIcon },
  { num: 2, text: '点击左侧【模型列表】查看模型 ID 和接口调用地址', to: '/models', Icon: BlocksIcon },
  { num: 3, text: '点击左侧【文本对话】在线体验所有 AI 聊天模型', to: '/playground', Icon: MessageSquareIcon },
  { num: 4, text: '点击左侧【图片生成】在线体验所有图片生成模型', to: '/image-gen', Icon: ImageIcon },
  { num: 5, text: '点击左侧【积分充值】充值积分', to: '/billing', Icon: ShoppingCartIcon },
]

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
        eyebrow="Overview"
        title="用户数据看板"
        description="查看账户余额与积分消耗，并快速进入常用功能。"
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
      <Card>
        <CardContent className="grid gap-0 p-0 sm:grid-cols-3">
          {[
            ['剩余积分', data.balance],
            ['累计消耗积分', data.totalConsumed],
            ['今日消耗积分', data.todayConsumed],
          ].map(([label, value], index) => (
            <div key={label} className="flex min-h-28 flex-col justify-center gap-2 border-b px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <p className="text-sm text-muted-foreground">{label}</p>
              {loading ? <Skeleton className="h-8 w-28" /> : <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatCredits(value as number)}</p>}
              {index === 0 ? <p className="text-xs text-muted-foreground">当前可用账户余额</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <PageSection title="快速开始" description="按顺序完成密钥创建、模型查看和接口体验。">
        <div className="flex flex-col divide-y">
          {guideSteps.map((step) => (
            <Link
              key={step.num}
              to={step.to}
              className="group flex items-center gap-3 px-1 py-3 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-xs font-semibold text-foreground">
                {step.num}
              </span>
              <step.Icon className="size-4 text-muted-foreground" />
              <span className="flex-1 text-foreground">{step.text}</span>
              <span className="hidden items-center gap-1 text-xs text-primary opacity-0 transition group-hover:opacity-100 sm:flex">
                立即前往 <ArrowRightIcon className="size-3" />
              </span>
            </Link>
          ))}
        </div>
      </PageSection>

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
