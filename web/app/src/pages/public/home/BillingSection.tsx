import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { Reveal } from '@/components/shared/Reveal'
import { useInView } from '@/hooks/use-in-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'
import { InlineCode } from '@/pages/public/home/InlineCode'
import { sectionDesc, sectionEdge, sectionHeading, sectionTop } from '@/pages/public/home/home-styles'

// `from` and `to` are the width of the illustrative balance bar before and after each stage. They show direction only.
const stages = [
  { key: 'Hold', from: '100%', to: '62%' },
  { key: 'Settle', from: '62%', to: '80%' },
  { key: 'Refund', from: '62%', to: '100%' },
] as const
const notes = ['Stream', 'Retry', 'Log', 'Protocol'] as const

const hopBox =
  'grid size-6.5 place-items-center rounded-lg border-[1.5px] border-muted-foreground/35 bg-glass-strong font-mono text-xs font-bold text-muted-foreground not-italic'

const rowClass =
  'relative grid gap-2 border-b border-glass-border px-7 py-6 transition-[background-color,padding] duration-300 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8 before:absolute before:inset-y-[20%] before:left-0 before:w-[3px] before:origin-center before:scale-y-0 before:rounded-full before:bg-primary before:transition-transform before:duration-300 hover:bg-glass-strong/45 hover:pl-10 hover:before:scale-y-100 data-[hot=true]:bg-glass-strong/45 data-[hot=true]:pl-10 data-[hot=true]:before:scale-y-100'

/** Counts 0 to length-1 every `ms` while `running`, and holds its last value otherwise. */
function useCycle(length: number, ms: number, running: boolean) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!running) return undefined
    const id = window.setInterval(() => setIndex((value) => (value + 1) % length), ms)
    return () => window.clearInterval(id)
  }, [length, ms, running])
  return index
}

/** A request fails on channel A and moves to B. Illustration only, so it is hidden from assistive tech. */
function HopDemo({ caption }: { caption: string }) {
  return (
    <div className='mt-3.5'>
      <div aria-hidden className='relative flex w-max items-center gap-10'>
        <i className={cn(hopBox, 'hop-a')}>A</i>
        <i className={cn(hopBox, 'hop-b')}>B</i>
        <i className={hopBox}>C</i>
        <b className='hop-dot absolute top-2 left-2 size-2.5 rounded-full bg-primary' />
      </div>
      <small className='mt-1.5 block text-xs text-faint'>{caption}</small>
    </div>
  )
}

/**
 * Billing: hold, settle and refund as three stations. A dot travels the rail, the balance bar in each card moves
 * as its stage lights up, and the four notes below take turns being highlighted. With reduced motion all stages
 * show their end state and nothing loops.
 */
export function BillingSection() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25, once: false })
  const running = inView && !reduced
  const stage = useCycle(stages.length, 2400, running)
  const note = useCycle(notes.length, 2400, running)

  return (
    <section id='billing' className={cn('scroll-mt-20', sectionTop, sectionEdge)}>
      <div ref={ref} className='grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16'>
        <Reveal className='lg:sticky lg:top-28 lg:self-start'>
          <h2 className={sectionHeading}>{t('home.billTitle')}</h2>
          <p className={sectionDesc}>{t('home.billDesc')}</p>
        </Reveal>
        <div className='min-w-0'>
          <div className='relative grid gap-[18px] md:grid-cols-3'>
            <div aria-hidden className='absolute inset-x-0 -top-5 hidden h-0.5 rounded-full bg-muted-foreground/25 md:block' />
            {reduced ? null : (
              <span
                aria-hidden
                className='absolute -top-6 hidden size-2.5 rounded-full bg-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_20%,transparent)] transition-[left] duration-1000 ease-out md:block'
                style={{ left: `calc((100% - 36px) / 3 * ${stage} + 18px * ${stage} + 28px)` }}
              />
            )}
            {stages.map((item, index) => (
              <Reveal key={item.key} delay={index} className='h-full'>
                <div
                  data-on={reduced || stage === index}
                  style={{ '--f': item.from, '--t': item.to } as CSSProperties}
                  className='glass group relative h-full p-6'
                >
                  <span
                    aria-hidden
                    className='absolute top-[-27px] left-[26px] hidden size-3.5 rounded-full border-2 border-muted-foreground/40 bg-background transition-[background-color,border-color] duration-500 group-data-[on=true]:border-primary group-data-[on=true]:bg-primary md:block'
                  />
                  <b className='block font-mono text-xs font-semibold text-primary'>{t(`home.bill${item.key}Stage`)}</b>
                  <h3 className='mt-1.5 text-xl font-extrabold'>{t(`home.bill${item.key}Title`)}</h3>
                  <p className='mt-2 leading-7 text-muted-foreground'>{t(`home.bill${item.key}Desc`)}</p>
                  <div aria-hidden className='mt-4 h-1.5 overflow-hidden rounded-full bg-muted-foreground/20'>
                    <i className='block h-full w-(--f) rounded-full bg-primary transition-[width] duration-1000 ease-out group-data-[on=true]:w-(--t)' />
                  </div>
                  <small className='mt-1.5 block text-xs text-faint'>{t('home.billBalance')}</small>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className='mt-[18px]'>
            <ul className='glass overflow-hidden'>
              {notes.map((key, index) => (
                <li key={key} data-hot={running && note === index} className={rowClass}>
                  <h3 className='text-lg font-extrabold'>{t(`home.bill${key}Title`)}</h3>
                  <div className='min-w-0'>
                    <p className='leading-7 text-muted-foreground'>
                      <InlineCode text={t(`home.bill${key}Desc`)} />
                    </p>
                    {key === 'Retry' ? <HopDemo caption={t('home.billHopCaption')} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
