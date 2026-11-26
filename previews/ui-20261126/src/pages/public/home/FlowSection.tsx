import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Reveal } from '@/components/shared/Reveal'
import { useInView } from '@/hooks/use-in-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { cn } from '@/lib/utils'
import { sectionDesc, sectionEdge, sectionHeading, sectionTop } from '@/pages/public/home/home-styles'

type NodeProps = { x: number; y: number; w: number; h: number; pad: number; title: string; sub: string; lit: boolean }

/** A dashed connector. The dashes always flow; the lit one is thicker and takes the brand colour. */
function Line({ d, lit }: { d: string; lit: boolean }) {
  return (
    <path
      d={d}
      fill='none'
      className={cn('dash-flow transition-colors duration-500', lit ? 'stroke-primary stroke-[2.5px]' : 'stroke-muted-foreground/30 stroke-2')}
    />
  )
}

function PathLabel({ x, y, end, children }: { x: number; y: number; end?: boolean; children: ReactNode }) {
  return (
    <text x={x} y={y} textAnchor={end ? 'end' : 'start'} className='fill-faint font-mono text-[11px]'>
      {children}
    </text>
  )
}

function Node({ x, y, w, h, pad, title, sub, lit }: NodeProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        className={cn('stroke-[1.5px] transition-[fill,stroke] duration-500', lit ? 'fill-glass-strong stroke-primary' : 'fill-glass stroke-glass-border')}
      />
      <text x={x + pad} y={y + h / 2 - 4} className='fill-foreground text-base font-bold'>
        {title}
      </text>
      <text x={x + pad} y={y + h / 2 + 15} className='fill-muted-foreground text-xs'>
        {sub}
      </text>
    </g>
  )
}

/** The hub every route passes through: a pulsing ring around a tinted sheet that carries the site name. */
function Gateway({ x, y, w, h, title, sub }: { x: number; y: number; w: number; h: number; title: string; sub: string }) {
  return (
    <g>
      <rect x={x - 8} y={y - 8} width={w + 16} height={h + 16} rx={24} fill='none' className='animate-pulse stroke-primary/30 stroke-[1.5px]' />
      <rect x={x} y={y} width={w} height={h} rx={18} className='fill-primary/10 stroke-primary stroke-[1.5px]' />
      <text x={x + w / 2} y={y + h / 2 - 3} textAnchor='middle' className='fill-foreground text-[22px] font-extrabold'>
        {title}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 21} textAnchor='middle' className='fill-muted-foreground text-xs'>
        {sub}
      </text>
    </g>
  )
}

/**
 * Flow diagram: Claude Code, Codex and your own app reach the gateway through their real paths, and from there the
 * text or image models. While it is on screen the highlight moves between the three routes. With reduced motion
 * every route is lit and nothing rotates.
 */
export function FlowSection() {
  const { t } = useTranslation()
  const { settings } = useSiteSettings()
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3, once: false })
  const [route, setRoute] = useState(0)

  useEffect(() => {
    if (reduced || !inView) return undefined
    const id = window.setInterval(() => setRoute((value) => (value + 1) % 3), 2600)
    return () => window.clearInterval(id)
  }, [reduced, inView])

  // `routes` lists the routes (0 Claude Code, 1 Codex, 2 your app) that pass through a shape.
  const lit = (routes: string) => reduced || routes.includes(String(route))
  const hub = settings.siteName
  const label = t('home.flowAria')

  return (
    <section id='flow' className={cn(sectionTop, sectionEdge)}>
      <Reveal>
        <h2 className={cn(sectionHeading, 'max-w-3xl')}>{t('home.flowTitle')}</h2>
        <p className={sectionDesc}>{t('home.flowDesc')}</p>
      </Reveal>
      <Reveal delay={1} className='mt-9'>
        <div ref={ref} className='glass p-[clamp(1rem,2.5vw,2.25rem)]'>
          <svg viewBox='0 0 1000 250' role='img' aria-label={label} className='hidden h-auto w-full md:block'>
            <Line d='M230,48 C310,48 310,125 390,125' lit={lit('0')} />
            <Line d='M230,125 L390,125' lit={lit('1')} />
            <Line d='M230,202 C310,202 310,125 390,125' lit={lit('2')} />
            <Line d='M610,105 C690,105 690,75 770,75' lit={lit('01')} />
            <Line d='M610,145 C690,145 690,175 770,175' lit={lit('2')} />
            <PathLabel x={238} y={38}>/v1/messages</PathLabel>
            <PathLabel x={238} y={116}>/v1/responses</PathLabel>
            <PathLabel x={238} y={226}>/v1/images/generations</PathLabel>
            <Node x={10} y={20} w={220} h={56} pad={18} title='Claude Code' sub={t('home.flowClaudeSub')} lit={lit('0')} />
            <Node x={10} y={97} w={220} h={56} pad={18} title='Codex' sub={t('home.flowCodexSub')} lit={lit('1')} />
            <Node x={10} y={174} w={220} h={56} pad={18} title={t('home.flowAppTitle')} sub={t('home.flowAppSub')} lit={lit('2')} />
            <Gateway x={390} y={65} w={220} h={120} title={hub} sub={t('home.flowGatewaySub')} />
            <Node x={770} y={47} w={220} h={56} pad={18} title={t('home.flowTextTitle')} sub={t('home.flowTextSub')} lit={lit('01')} />
            <Node x={770} y={147} w={220} h={56} pad={18} title={t('home.flowImageTitle')} sub={t('home.flowImageSub')} lit={lit('2')} />
          </svg>
          <svg viewBox='0 0 340 428' role='img' aria-label={label} className='mx-auto block h-auto w-full max-w-[420px] md:hidden'>
            <Line d='M250,26 H310 V238' lit={lit('0')} />
            <Line d='M250,88 H290 V238' lit={lit('1')} />
            <Line d='M250,150 H270 V238' lit={lit('2')} />
            <Line d='M80,322 V372' lit={lit('01')} />
            <Line d='M260,322 V372' lit={lit('2')} />
            <PathLabel x={238} y={30} end>/v1/messages</PathLabel>
            <PathLabel x={238} y={92} end>/v1/responses</PathLabel>
            <PathLabel x={238} y={154} end>/v1/images/generations</PathLabel>
            <Node x={0} y={0} w={250} h={52} pad={14} title='Claude Code' sub={t('home.flowClaudeSub')} lit={lit('0')} />
            <Node x={0} y={62} w={250} h={52} pad={14} title='Codex' sub={t('home.flowCodexSub')} lit={lit('1')} />
            <Node x={0} y={124} w={250} h={52} pad={14} title={t('home.flowAppTitle')} sub={t('home.flowAppSub')} lit={lit('2')} />
            <Gateway x={8} y={238} w={324} h={76} title={hub} sub={t('home.flowGatewaySub')} />
            <Node x={0} y={372} w={160} h={52} pad={14} title={t('home.flowTextTitle')} sub={t('home.flowTextSub')} lit={lit('01')} />
            <Node x={180} y={372} w={160} h={52} pad={14} title={t('home.flowImageTitle')} sub={t('home.flowImageSub')} lit={lit('2')} />
          </svg>
        </div>
      </Reveal>
    </section>
  )
}
