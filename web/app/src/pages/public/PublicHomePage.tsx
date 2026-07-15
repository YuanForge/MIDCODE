import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ActivityIcon,
  ArrowRightIcon,
  BarChart3Icon,
  BlocksIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  Code2Icon,
  DatabaseZapIcon,
  GaugeIcon,
  Globe2Icon,
  ImageIcon,
  KeyRoundIcon,
  Layers3Icon,
  LockKeyholeIcon,
  MessageSquareTextIcon,
  MusicIcon,
  NetworkIcon,
  PlayCircleIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalSquareIcon,
  VideoIcon,
  WalletCardsIcon,
  ZapIcon,
} from 'lucide-react'

import { AppLogo } from '@/components/shared/AppLogo'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { getHomePathForLanguage } from '@/i18n'
import { getRoleToken } from '@/lib/auth/storage'
import { cn } from '@/lib/utils'

type Feature = {
  titleKey: string
  descriptionKey: string
  Icon: ComponentType<{ className?: string }>
  span?: string
  preview: ReactNode
}

const modelPills = [
  'GPT',
  'Claude',
  'Gemini',
  'DeepSeek',
  'Qwen',
  'Suno',
  'Kling',
  'SD',
]

const capabilities = [
  'home.statsUpstreams',
  'home.statsCapabilities',
  'home.statsProtocol',
  'home.statsBilling',
]

const features: Feature[] = [
  {
    titleKey: 'home.featureGatewayTitle',
    descriptionKey: 'home.featureGatewayDesc',
    Icon: NetworkIcon,
    span: 'lg:col-span-2',
    preview: (
      <div className="grid grid-cols-4 gap-2">
        {modelPills.map((name) => (
          <span
            key={name}
            className="rounded-md border border-border/70 bg-background/70 px-2 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {name}
          </span>
        ))}
      </div>
    ),
  },
  {
    titleKey: 'home.featureKeysTitle',
    descriptionKey: 'home.featureKeysDesc',
    Icon: KeyRoundIcon,
    preview: (
      <div className="flex flex-col gap-2 text-xs">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <KeyRoundIcon className="size-3.5 text-primary" />
            <span className="h-2 flex-1 rounded-full bg-muted" aria-hidden />
          </div>
        ))}
      </div>
    ),
  },
  {
    titleKey: 'home.featureObserveTitle',
    descriptionKey: 'home.featureObserveDesc',
    Icon: ActivityIcon,
    preview: (
      <div className="grid grid-cols-3 gap-2">
        {[ActivityIcon, BarChart3Icon, RadioTowerIcon].map((Icon, index) => (
          <div key={index} className="flex h-20 items-center justify-center rounded-md border border-border bg-background">
            <Icon className="size-5 text-primary" />
          </div>
        ))}
      </div>
    ),
  },
  {
    titleKey: 'home.featureProtocolTitle',
    descriptionKey: 'home.featureProtocolDesc',
    Icon: Code2Icon,
    span: 'lg:col-span-2',
    preview: (
      <div className="rounded-lg border border-border bg-muted p-3 font-mono text-[11px] leading-5 text-foreground">
        <div><span className="text-primary">POST</span> /v1/chat/completions</div>
        <div><span className="text-primary">POST</span> /v1/images/generations</div>
        <div><span className="text-primary">GET</span> /v1/tasks/&#123;task_id&#125;</div>
      </div>
    ),
  },
]

const workflow = [
  {
    titleKey: 'home.workflowKeyTitle',
    descriptionKey: 'home.workflowKeyDesc',
    Icon: KeyRoundIcon,
  },
  {
    titleKey: 'home.workflowModelTitle',
    descriptionKey: 'home.workflowModelDesc',
    Icon: BlocksIcon,
  },
  {
    titleKey: 'home.workflowMonitorTitle',
    descriptionKey: 'home.workflowMonitorDesc',
    Icon: BarChart3Icon,
  },
]

function PublicHeader({ siteName, logoUrl, signedIn }: { siteName: string; logoUrl: string; signedIn: boolean }) {
  const { i18n, t } = useTranslation()
  const homePath = getHomePathForLanguage(i18n.language)

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={homePath} aria-label={siteName}>
          <AppLogo siteName={siteName} logoUrl={logoUrl} label="AI Gateway" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">{t('common.features')}</a>
          <a href="#models" className="transition hover:text-foreground">{t('common.models')}</a>
          <a href="#workflow" className="transition hover:text-foreground">{t('common.workflow')}</a>
          <Link to="/docs" className="transition hover:text-foreground">{t('common.docs')}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          {signedIn ? (
            <Button asChild>
              <Link to="/dashboard">
                {t('common.dashboard')}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link to="/login">{t('common.login')}</Link>
              </Button>
              <Button asChild>
                <Link to="/register">
                  {t('common.startUsing')}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function ApiTerminal() {
  return (
    <Card className="mx-auto w-full max-w-xl shadow-lg">
      <CardHeader className="border-b">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">AI Gateway</p>
        <CardTitle><h3>Request</h3></CardTitle>
        <CardDescription>POST /v1/chat/completions</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 font-mono text-xs leading-6">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ['Chat', '/v1/chat/completions'],
            ['Image', '/v1/images/generations'],
            ['Task', '/v1/tasks/{id}'],
          ].map(([label, endpoint]) => (
            <div key={label} className="min-w-0 rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="font-medium text-foreground">{label}</div>
              <div className="truncate text-[11px] text-muted-foreground">{endpoint}</div>
            </div>
          ))}
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-muted p-4 text-foreground">
<span className="text-primary">curl</span> -X POST "{'{'}origin{'}'}/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{'{'}"model":"MODEL_ID","messages":[...]{'}'}'
        </pre>
      </CardContent>
    </Card>
  )
}

function CapabilityStrip() {
  const { t } = useTranslation()
  const items = [
    { label: t('home.capabilityText'), Icon: MessageSquareTextIcon },
    { label: t('home.capabilityImage'), Icon: ImageIcon },
    { label: t('home.capabilityVideo'), Icon: VideoIcon },
    { label: t('home.capabilityMusic'), Icon: MusicIcon },
    { label: t('home.capabilityAsync'), Icon: RadioTowerIcon },
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {items.map(({ label, Icon }) => (
        <span
          key={label}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm font-medium shadow-sm backdrop-blur"
        >
          <Icon className="size-4 text-primary" />
          {label}
        </span>
      ))}
    </div>
  )
}

export function PublicHomePage() {
  const { t } = useTranslation()
  const { settings } = useSiteSettings()
  const signedIn = Boolean(getRoleToken('user'))
  const { siteName, logoUrl } = settings

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <PublicHeader siteName={siteName} logoUrl={logoUrl} signedIn={signedIn} />

      <main>
        <section className="relative isolate overflow-hidden">
          <img
            src="/landing/gateway-hero.png"
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-25"
          />
          <div className="absolute inset-0 -z-10 bg-background/75" />

          <div className="mx-auto flex max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:min-h-[calc(100svh-9rem)] lg:items-center lg:py-20">
            <div className="max-w-3xl">
              <Badge className="mb-5" variant="secondary">
                <SparklesIcon data-icon="inline-start" />
                {t('home.badge')}
              </Badge>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {siteName}
                <span className="block text-primary">{t('home.headline')}</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
                {t('home.subhead')}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-11 px-5">
                  <Link to={signedIn ? '/dashboard' : '/register'}>
                    {signedIn ? t('home.primaryCtaSignedIn') : t('home.primaryCtaGuest')}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-5">
                  <Link to="/models">
                    {t('home.viewModels')}
                    <BlocksIcon data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-11 px-5">
                  <Link to="/docs">
                    {t('home.readDocs')}
                    <BookOpenIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
              <div className="mt-10 hidden sm:block">
                <CapabilityStrip />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/40">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border/60 px-0 sm:grid-cols-4">
            {capabilities.map((labelKey) => (
              <div key={labelKey} className="bg-background px-6 py-8 text-center">
                <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="max-w-xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('home.apiPreviewKicker')}</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.apiPreviewTitle')}</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {t('home.apiPreviewDesc')}
              </p>
            </div>
            <ApiTerminal />
          </div>
        </section>

        <section id="features" className="px-4 py-20 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 max-w-2xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('home.coreKicker')}</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.coreTitle')}</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {t('home.coreDesc')}
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 lg:grid-cols-3">
              {features.map(({ titleKey, descriptionKey, Icon, span, preview }) => (
                <article key={titleKey} className={cn('bg-background p-6 transition hover:bg-muted/30', span)}>
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="text-base font-semibold">{t(titleKey)}</h3>
                  </div>
                  <p className="min-h-14 text-sm leading-6 text-muted-foreground">{t(descriptionKey)}</p>
                  <div className="mt-6">{preview}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="models" className="border-y border-border/60 bg-muted/25 px-4 py-20 sm:px-6 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('home.modelHubKicker')}</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.modelHubTitle')}</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {t('home.modelHubDesc')}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/models">
                    {t('home.browseModels')}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/docs">
                    {t('home.apiDocs')}
                    <TerminalSquareIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { titleKey: 'home.llmTitle', descKey: 'home.llmDesc', Icon: MessageSquareTextIcon },
                { titleKey: 'home.imageTitle', descKey: 'home.imageDesc', Icon: ImageIcon },
                { titleKey: 'home.videoTitle', descKey: 'home.videoDesc', Icon: VideoIcon },
                { titleKey: 'home.musicTitle', descKey: 'home.musicDesc', Icon: MusicIcon },
              ].map(({ titleKey, descKey, Icon }) => (
                <Card key={titleKey} className="shadow-sm">
                  <CardHeader>
                    <Icon className="mb-3 size-5 text-primary" />
                    <CardTitle><h3>{t(titleKey)}</h3></CardTitle>
                    <CardDescription className="leading-6">{t(descKey)}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="px-4 py-20 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('home.workflowKicker')}</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.workflowTitle')}</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {workflow.map(({ titleKey, descriptionKey, Icon }, index) => (
                <div key={titleKey} className="relative rounded-xl border border-border/70 bg-card p-6">
                  <span className="absolute right-5 top-5 text-5xl font-semibold leading-none text-muted/80">
                    {index + 1}
                  </span>
                  <div className="mb-6 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-6" />
                  </div>
                  <h3 className="text-lg font-semibold">{t(titleKey)}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(descriptionKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-foreground px-4 py-16 text-background sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                {[ShieldCheckIcon, GaugeIcon, WalletCardsIcon, DatabaseZapIcon, LockKeyholeIcon, Globe2Icon, Layers3Icon, PlayCircleIcon, ZapIcon, CheckCircle2Icon].map((Icon, index) => (
                  <span key={index} className="flex size-9 items-center justify-center rounded-lg bg-background/10 text-background/80">
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('home.finalTitle')}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-background/70">
                {t('home.finalDesc')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Button asChild variant="secondary">
                <Link to={signedIn ? '/dashboard' : '/register'}>
                  {signedIn ? t('home.primaryCtaSignedIn') : t('home.registerAccount')}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/login">{t('common.login')}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>{siteName} AI Gateway</span>
          <div className="flex gap-5">
            <Link to="/models" className="hover:text-foreground">{t('home.footerProduct')}</Link>
            <Link to="/docs" className="hover:text-foreground">{t('common.docs')}</Link>
            <Link to="/login" className="hover:text-foreground">{t('common.login')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
