import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckIcon } from 'lucide-react'

import { CopyButton } from '@/components/shared/CopyButton'
import { cn } from '@/lib/utils'
import type { LineKind, Tutorial } from '@/pages/public/home/tutorial-data'

const LINE_HEIGHT = 24
// Top padding on phones (the copy button gets its own row) plus the bottom padding.
const CODE_PADDING = 68

const rowClass: Record<LineKind, string> = {
  shell: "before:mr-2 before:text-code-muted before:content-['$']",
  comment: 'text-code-muted',
  output: 'text-success',
  plain: '',
}

const pill =
  'translate-y-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold opacity-0 transition-[opacity,transform] duration-500 data-[in=true]:translate-y-0 data-[in=true]:opacity-100'

/** Sets the odd parts of a backtick-split step as inline code. */
function Inline({ text }: { text: string }): ReactNode {
  return text.split('`').map((part, index) =>
    index % 2 ? (
      <code key={index} className='rounded-md bg-glass-strong px-1.5 py-px font-mono text-[12.5px] text-foreground'>
        {part}
      </code>
    ) : (
      part
    ),
  )
}

/**
 * One walkthrough that plays itself: the key badge appears, the code is typed, the steps on the left light up and
 * tick off with the lines, then the request result and the note arrive. Mount it with a `key` per tutorial.
 * `onTyped` fires once the result is on screen. With reduced motion the finished state shows at once.
 */
export function TutorialPanel({
  tutorial,
  lineCount,
  copyLabel,
  active,
  reduced,
  onTyped,
}: {
  tutorial: Tutorial
  lineCount: number
  copyLabel: string
  active: boolean
  reduced: boolean
  onTyped: () => void
}) {
  const { lines, steps } = tutorial
  const offsets = useMemo(() => {
    const starts: number[] = []
    let at = 0
    for (const item of lines) {
      starts.push(at)
      at += item.text.length + 1
    }
    return starts
  }, [lines])
  const total = offsets[offsets.length - 1] + lines[lines.length - 1].text.length
  const [shown, setShown] = useState(reduced ? total : 0)
  const [phase, setPhase] = useState(reduced ? 2 : 0)
  const [keyIn, setKeyIn] = useState(reduced)
  const shownRef = useRef(shown)
  const complete = shown >= total
  const startDelay = tutorial.keyLabel ? 950 : 200

  useEffect(() => {
    if (reduced) return undefined
    const id = window.setTimeout(() => setKeyIn(true), 60)
    return () => window.clearTimeout(id)
  }, [reduced])

  useEffect(() => {
    if (reduced || !active || shownRef.current >= total) return undefined
    let interval = 0
    const start = window.setTimeout(
      () => {
        interval = window.setInterval(() => {
          shownRef.current = Math.min(total, shownRef.current + 2)
          setShown(shownRef.current)
          if (shownRef.current >= total) window.clearInterval(interval)
        }, 18)
      },
      shownRef.current === 0 ? startDelay : 0,
    )
    return () => {
      window.clearTimeout(start)
      window.clearInterval(interval)
    }
  }, [active, reduced, total, startDelay])

  useEffect(() => {
    if (!complete || reduced) return undefined
    const first = window.setTimeout(() => setPhase(1), 300)
    const second = window.setTimeout(() => {
      setPhase(2)
      onTyped()
    }, 750)
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [complete, reduced, onTyped])

  const cursor = Math.max(0, offsets.filter((offset) => shown >= offset).length - 1)
  const current = complete ? steps.length : shown === 0 ? 0 : lines[cursor].step
  const copyText = lines
    .filter((item) => item.kind !== 'output')
    .map((item) => item.text)
    .join('\n')

  return (
    <div className='grid animate-page-enter gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
      <div className='min-w-0'>
        <h3 className='text-[22px] font-extrabold'>{tutorial.title}</h3>
        <ol className='mt-5 flex flex-col gap-4'>
          {steps.map((step, index) => {
            const state = index < current ? 'done' : index === current ? 'current' : 'idle'
            return (
              <li
                key={index}
                data-state={state}
                className='flex items-start gap-3 leading-7 text-muted-foreground opacity-45 transition-[opacity,color] duration-500 data-[state=current]:text-foreground data-[state=current]:opacity-100 data-[state=done]:opacity-100'
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-6.5 shrink-0 place-items-center rounded-full text-xs font-extrabold transition-colors duration-300',
                    state === 'idle' ? 'bg-primary/15 text-primary' : 'bg-primary text-primary-foreground',
                    state === 'current' && 'step-ring',
                  )}
                >
                  {state === 'done' ? <CheckIcon className='size-3.5' strokeWidth={3} /> : index + 1}
                </span>
                <span className='min-w-0'>
                  <Inline text={step} />
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className='min-w-0'>
        {tutorial.keyLabel ? (
          <div
            data-in={keyIn}
            className='mb-2.5 inline-flex translate-y-1.5 items-center gap-2 rounded-full border border-glass-border bg-glass-strong px-3.5 py-1 text-[13px] font-semibold text-muted-foreground opacity-0 transition-[opacity,transform] duration-500 data-[in=true]:translate-y-0 data-[in=true]:opacity-100'
          >
            <span aria-hidden className='size-2 rounded-full bg-primary' />
            {tutorial.keyLabel}
            <code className='font-mono text-primary'>sk-••••••••</code>
          </div>
        ) : (
          <div aria-hidden className='mb-2.5 hidden h-8 lg:block' />
        )}
        <div className='relative rounded-xl bg-code text-code-foreground'>
          <div className='absolute top-2 right-2 z-10'>
            <CopyButton
              value={copyText}
              label={copyLabel}
              showLabel
              size='sm'
              className='h-7 px-2 text-xs text-code-muted hover:bg-white/8 hover:text-code-foreground'
            />
          </div>
          <span className='sr-only'>{copyText}</span>
          <pre
            aria-hidden
            className='overflow-x-auto p-5 pt-12 font-mono text-[13px] leading-6 whitespace-pre sm:pt-5 sm:pr-24'
            style={{ minHeight: lineCount * LINE_HEIGHT + CODE_PADDING }}
          >
            {lines.map((item, index) =>
              shown >= offsets[index] ? (
                <div key={index} className={cn('min-h-6', rowClass[item.kind])}>
                  {item.text.slice(0, shown - offsets[index])}
                  {index === cursor && !complete ? <i className='home-caret' /> : null}
                </div>
              ) : null,
            )}
          </pre>
          {tutorial.thumb ? (
            <div
              aria-hidden
              data-in={phase >= 2}
              className='mx-5 mb-5 h-28 scale-105 overflow-hidden rounded-xl opacity-0 blur-md transition-[opacity,filter,transform] duration-1000 data-[in=true]:scale-100 data-[in=true]:opacity-100 data-[in=true]:blur-none sm:absolute sm:right-5 sm:bottom-5 sm:mx-0 sm:mb-0 sm:h-24 sm:w-36'
            >
              <svg viewBox='0 0 150 96' preserveAspectRatio='xMidYMid slice' className='size-full'>
                <rect width='150' height='96' className='fill-primary/20' />
                <circle cx='118' cy='24' r='9' className='fill-white/90' />
                <rect y='60' width='150' height='36' className='fill-primary/50' />
                <path d='M60,60 L66,26 L78,26 L84,60 Z' className='fill-white' />
                <rect x='64' y='18' width='16' height='8' className='fill-foreground/80' />
              </svg>
            </div>
          ) : null}
        </div>
        <div className='mt-3 flex min-h-7 flex-wrap gap-2'>
          <span data-in={phase >= 1} className={cn(pill, 'bg-primary/12 text-primary')}>
            {tutorial.endpoint}
          </span>
          <span data-in={phase >= 2} className={cn(pill, 'bg-success/15 text-success')}>
            {tutorial.ok}
          </span>
        </div>
        <p
          data-in={phase >= 2}
          className='mt-3 translate-y-1.5 text-[13px] leading-7 text-muted-foreground opacity-0 transition-[opacity,transform] duration-500 data-[in=true]:translate-y-0 data-[in=true]:opacity-100'
        >
          {tutorial.note}
        </p>
      </div>
    </div>
  )
}
