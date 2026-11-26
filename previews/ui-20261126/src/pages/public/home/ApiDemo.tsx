import { useCallback, useEffect, useRef, useState } from 'react'

import { CopyButton } from '@/components/shared/CopyButton'
import { useInView } from '@/hooks/use-in-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

export type DemoEndpoint = { method: string; path: string; label: string; code: string }

const codeText = 'p-5 pt-12 pr-5 sm:pt-5 sm:pr-20 font-mono text-[13px] leading-7 whitespace-pre sm:whitespace-pre-wrap sm:[overflow-wrap:anywhere]'

/** Types `code` out two characters at a time while `active`, and calls `onDone` once it is complete. */
function TypedCode({
  code,
  active,
  reduced,
  onDone,
}: {
  code: string
  active: boolean
  reduced: boolean
  onDone: () => void
}) {
  const [count, setCount] = useState(reduced ? code.length : 0)
  const countRef = useRef(count)

  useEffect(() => {
    if (reduced || !active || countRef.current >= code.length) return undefined
    const timer = window.setInterval(() => {
      countRef.current = Math.min(code.length, countRef.current + 2)
      setCount(countRef.current)
      if (countRef.current >= code.length) {
        window.clearInterval(timer)
        onDone()
      }
    }, 18)
    return () => window.clearInterval(timer)
  }, [active, code.length, onDone, reduced])

  return (
    <pre aria-hidden className={cn(codeText, 'absolute inset-0')}>
      {code.slice(0, count)}
      {count >= code.length ? null : <i className='home-caret' />}
    </pre>
  )
}

/**
 * Request demo: one tab per real endpoint, with the curl typed out. When a tab finishes typing, its underline
 * fills and the next tab takes over. Hover or focus pauses the fill, and a manual pick stops the rotation.
 */
export function ApiDemo({ endpoints, copyLabel }: { endpoints: DemoEndpoint[]; copyLabel: string }) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3, once: false })
  const [index, setIndex] = useState(0)
  const [holding, setHolding] = useState(false)
  const [manual, setManual] = useState(false)
  const handleDone = useCallback(() => setHolding(true), [])
  const current = endpoints[index]
  const advancing = holding && !manual && !reduced

  const select = (next: number, byUser: boolean) => {
    setIndex(next)
    setHolding(false)
    if (byUser) setManual(true)
  }

  return (
    <div ref={ref} className='glass group overflow-hidden'>
      <div role='tablist' className='flex border-b border-glass-border'>
        {endpoints.map((endpoint, position) => {
          const selected = position === index
          return (
            <button
              key={endpoint.path}
              type='button'
              role='tab'
              aria-selected={selected}
              onClick={() => select(position, true)}
              className={cn(
                'relative min-w-0 flex-1 border-r border-glass-border px-4 py-3.5 text-left outline-none transition-colors last:border-r-0 hover:bg-glass-strong/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset',
                selected ? 'bg-glass-strong text-foreground' : 'text-muted-foreground',
              )}
            >
              <code className={cn('block truncate font-mono text-[11px] font-semibold', selected ? 'text-primary' : 'text-faint')}>
                {endpoint.method} {endpoint.path}
              </code>
              <span className='mt-0.5 block font-semibold'>{endpoint.label}</span>
              {selected && advancing ? (
                <span
                  aria-hidden
                  className='tab-progress absolute inset-x-0 -bottom-px h-0.5 bg-primary group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]'
                  style={{ animationPlayState: inView ? undefined : 'paused' }}
                  onAnimationEnd={() => select((index + 1) % endpoints.length, false)}
                />
              ) : null}
            </button>
          )
        })}
      </div>
      <div role='tabpanel' className='relative m-3.5 rounded-xl bg-code text-code-foreground'>
        <div className='absolute top-2 right-2 z-10'>
          <CopyButton
            value={current.code}
            label={copyLabel}
            showLabel
            size='sm'
            className='h-7 px-2 text-xs text-code-muted hover:bg-white/8 hover:text-code-foreground'
          />
        </div>
        <span className='sr-only'>{current.code}</span>
        <div className='relative overflow-x-auto'>
          <pre aria-hidden className={cn(codeText, 'invisible')}>
            {current.code}
          </pre>
          <TypedCode key={index} code={current.code} active={inView} reduced={reduced} onDone={handleDone} />
        </div>
      </div>
    </div>
  )
}
