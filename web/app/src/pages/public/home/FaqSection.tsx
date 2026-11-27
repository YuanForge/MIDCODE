import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Reveal } from '@/components/shared/Reveal'
import { useInView } from '@/hooks/use-in-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'
import { InlineCode } from '@/pages/public/home/InlineCode'
import { sectionDesc, sectionEdge, sectionHeading, sectionTop } from '@/pages/public/home/home-styles'

const COUNT = 8

/**
 * FAQ: the rows slide in one after another, and while the section is on screen the answers open in turn.
 * Hover, focus or a click hands control to the visitor, and reduced motion turns the rotation off.
 */
export function FaqSection() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3, once: false })
  const [open, setOpen] = useState<number | null>(0)
  const [engaged, setEngaged] = useState(false)
  const [hovering, setHovering] = useState(false)
  const auto = inView && !reduced && !engaged && !hovering

  useEffect(() => {
    if (!auto) return undefined
    const id = window.setInterval(() => setOpen((value) => ((value ?? -1) + 1) % COUNT), 4200)
    return () => window.clearInterval(id)
  }, [auto])

  const toggle = (index: number) => {
    setEngaged(true)
    setOpen((value) => (value === index ? null : index))
  }

  return (
    <section id='faq' className={cn('scroll-mt-20', sectionTop, sectionEdge)}>
      <div ref={ref} className='grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16'>
        <Reveal className='lg:sticky lg:top-28 lg:self-start'>
          <h2 className={sectionHeading}>{t('home.faqTitle')}</h2>
          <p className={sectionDesc}>{t('home.faqDesc')}</p>
        </Reveal>
        <ul
          className='glass min-w-0 overflow-hidden'
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setEngaged(true)}
        >
          {Array.from({ length: COUNT }, (_, index) => {
            const isOpen = open === index
            return (
              <li key={index} className='border-b border-glass-border last:border-b-0'>
                <Reveal delay={index}>
                  <h3>
                    <button
                      type='button'
                      id={`faq-q-${index}`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-a-${index}`}
                      onClick={() => toggle(index)}
                      className='flex w-full items-center justify-between gap-4 px-7 py-5 text-left text-[17px] font-bold outline-none transition-colors hover:bg-glass-strong/45 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset'
                    >
                      {t(`home.faq${index + 1}Q`)}
                      <span aria-hidden className='relative size-5.5 shrink-0'>
                        <span className='absolute inset-x-[3px] top-2.5 h-0.5 rounded-full bg-primary' />
                        <span
                          className={cn(
                            'absolute inset-x-[3px] top-2.5 h-0.5 rounded-full bg-primary transition-transform duration-300 ease-out',
                            isOpen ? 'rotate-0' : 'rotate-90',
                          )}
                        />
                      </span>
                    </button>
                  </h3>
                  <div
                    id={`faq-a-${index}`}
                    role='region'
                    aria-labelledby={`faq-q-${index}`}
                    data-open={isOpen}
                    inert={!isOpen}
                    className='reveal-panel'
                  >
                    <div>
                      <p className='max-w-3xl px-7 pb-6 leading-8 text-muted-foreground'>
                        <InlineCode text={t(`home.faq${index + 1}A`)} />
                      </p>
                    </div>
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
