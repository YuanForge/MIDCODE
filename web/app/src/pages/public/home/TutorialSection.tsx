import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Reveal } from '@/components/shared/Reveal'
import { useInView } from '@/hooks/use-in-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { cn } from '@/lib/utils'
import { sectionDesc, sectionEdge, sectionHeading, sectionTop } from '@/pages/public/home/home-styles'
import { TutorialPanel } from '@/pages/public/home/TutorialPanel'
import { buildTutorials } from '@/pages/public/home/tutorial-data'

/**
 * Connect guide: a tab per tool, each one a self-playing walkthrough. When a walkthrough finishes, the underline on
 * its tab fills and the next one starts. Hover or focus pauses the fill, and picking a tab by hand stops the rotation.
 */
export function TutorialSection() {
  const { t } = useTranslation()
  const { settings } = useSiteSettings()
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3, once: false })
  const [index, setIndex] = useState(0)
  const [holding, setHolding] = useState(false)
  const [manual, setManual] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const tutorials = useMemo(
    () => buildTutorials(origin, settings.siteName, (key) => t(key)),
    [origin, settings.siteName, t],
  )
  const lineCount = Math.max(...tutorials.map((item) => item.lines.length))
  const handleTyped = useCallback(() => setHolding(true), [])
  const advancing = holding && !manual && !reduced
  const current = tutorials[index]

  const select = (next: number) => {
    setIndex(next)
    setHolding(false)
    setManual(true)
  }
  const advance = () => {
    setIndex((value) => (value + 1) % tutorials.length)
    setHolding(false)
  }

  return (
    <section id='guide' className={cn('scroll-mt-20', sectionTop, sectionEdge)}>
      <Reveal>
        <h2 className={sectionHeading}>{t('home.tutTitle')}</h2>
        <p className={sectionDesc}>{t('home.tutDesc')}</p>
      </Reveal>
      <Reveal delay={1} className='mt-9'>
        <div ref={ref} className='glass group overflow-hidden'>
          <div role='tablist' className='flex flex-wrap gap-2 border-b border-glass-border p-3.5'>
            {tutorials.map((item, position) => {
              const selected = position === index
              return (
                <button
                  key={item.id}
                  type='button'
                  role='tab'
                  aria-selected={selected}
                  onClick={() => select(position)}
                  className={cn(
                    'relative rounded-full px-4.5 py-1.5 font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40',
                    selected ? 'bg-foreground/90 text-background' : 'text-muted-foreground hover:bg-glass-strong',
                  )}
                >
                  {item.label}
                  {selected && advancing ? (
                    <span
                      aria-hidden
                      className='tab-progress absolute inset-x-4 bottom-0.5 h-0.5 rounded-full bg-background/55 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]'
                      style={{ animationPlayState: inView ? undefined : 'paused' }}
                      onAnimationEnd={advance}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
          <div role='tabpanel'>
            <TutorialPanel
              key={current.id}
              tutorial={current}
              lineCount={lineCount}
              copyLabel={t('common.copyCode')}
              active={inView}
              reduced={reduced}
              onTyped={handleTyped}
            />
          </div>
        </div>
      </Reveal>
    </section>
  )
}
