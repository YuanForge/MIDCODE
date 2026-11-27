import { CopyButton } from '@/components/shared/CopyButton'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { TokenPrice } from '@/pages/user/models/price'

export type ModelTone = 'success' | 'warning' | 'danger' | 'neutral'
export type ModelBar = { ok: boolean; ratio: number } | null

export type ModelCardData = {
  key: string
  name: string
  modelId: string
  iconUrl?: string
  initial: string
  provider: string
  tags: string[]
  /** The token price as two figures, when the price is the usual input and output pair. */
  price: TokenPrice | null
  /** Price text shown as written: every line when there is no pair, otherwise the lines after it. */
  priceLines: string[]
  priceFallback: string
  status: { label: string; tone: ModelTone }
  /** Success rate first, then request count and latency. */
  readings: Array<{ label: string; value: string }>
  bars: ModelBar[]
  barsLabel?: string
  onOpen: () => void
}

export type ModelCardLabels = {
  copyId: string
  copiedId: string
  input: string
  output: string
}

const toneText: Record<ModelTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  neutral: 'text-muted-foreground',
}

// Columns follow the width that is available, so a wide window shows more models instead of wider cards.
const grid = 'grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3'

/**
 * One compact card = one model, sized so a dozen fit on a screen. It reads top to bottom as: which model, what it
 * costs, how it has been doing. The token price is two aligned figures, so cards compare figure by figure. The
 * line along the bottom edge is the last 60 calls, one tick each, so a model that failed recently shows at a
 * glance without a chart on every card. The model id is shown only when it differs from the name. The whole card
 * opens the API sheet; the stretched button inside the title keeps that reachable by keyboard.
 */
export function ModelCards({ models, labels }: { models: ModelCardData[]; labels: ModelCardLabels }) {
  return (
    <ul className={grid}>
      {models.map((model) => {
        const [rate, ...rest] = model.readings
        return (
          <li
            key={model.key}
            data-slot='model-card'
            className='surface-dense relative flex min-w-0 flex-col gap-3.5 overflow-hidden px-4 pt-4 pb-[1.125rem] transition-[background-color,border-color] duration-140 hover:bg-card has-[[data-card-trigger]:focus-visible]:ring-3 has-[[data-card-trigger]:focus-visible]:ring-ring/40'
          >
            <div className='flex items-start gap-3'>
              <span className='flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-glass-border bg-glass-strong text-xs font-semibold text-muted-foreground'>
                {model.iconUrl ? <img alt='' src={model.iconUrl} className='size-full object-cover' /> : model.initial}
              </span>
              <div className='min-w-0 flex-1'>
                <h3 className='truncate text-[15px] leading-5 font-semibold text-foreground' title={model.name}>
                  <button type='button' data-card-trigger className='text-left outline-none' onClick={model.onOpen}>
                    <span aria-hidden className='absolute inset-0' />
                    {model.name}
                  </button>
                </h3>
                <p className='mt-0.5 flex min-w-0 gap-2 text-xs'>
                  {model.provider ? <span className='truncate text-muted-foreground'>{model.provider}</span> : null}
                  {model.tags[0] ? <span className='shrink-0 text-faint'>{model.tags[0]}</span> : null}
                </p>
                {model.modelId !== model.name ? (
                  <code className='mt-0.5 block truncate font-mono text-[11px] text-muted-foreground' title={model.modelId}>
                    {model.modelId}
                  </code>
                ) : null}
              </div>
              <span className='relative z-10 -mt-1.5 -mr-2 shrink-0'>
                <CopyButton value={model.modelId} label={labels.copyId} successMessage={labels.copiedId} />
              </span>
            </div>

            <div className='flex flex-col gap-1 tabular-nums'>
              {model.price ? (
                <dl data-slot='model-price' className='grid grid-cols-2 gap-x-4'>
                  {[
                    { label: labels.input, value: model.price.input },
                    { label: labels.output, value: model.price.output },
                  ].map((figure) => (
                    <div key={figure.label} className='flex min-w-0 flex-col'>
                      <dt className='truncate text-[11px] leading-4 text-muted-foreground'>{figure.label}</dt>
                      <dd className='truncate text-base leading-6 font-semibold tracking-[-0.01em] text-foreground'>{figure.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {model.priceLines.map((line, index) => (
                <span
                  key={index}
                  className={cn(
                    '[overflow-wrap:anywhere]',
                    !model.price && index === 0 ? 'text-[15px] leading-6 font-semibold text-foreground' : 'text-xs text-muted-foreground',
                  )}
                >
                  {line}
                </span>
              ))}
              {!model.price && model.priceLines.length === 0 ? (
                <span className='text-[13px] text-muted-foreground'>{model.priceFallback}</span>
              ) : null}
            </div>

            <div className='mt-auto flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xs tabular-nums'>
              <span className={cn('inline-flex items-baseline whitespace-nowrap gap-1.5 font-medium', toneText[model.status.tone])}>
                <span aria-hidden className='size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-current' />
                <span className='truncate'>{model.status.label}</span>
                {rate ? (
                  <span className='shrink-0 font-normal text-foreground' title={rate.label}>
                    <span className='sr-only'>{rate.label} </span>
                    {rate.value}
                  </span>
                ) : null}
              </span>
              {rest.length ? (
                <span className='contents text-muted-foreground'>
                  {rest.map((reading) => (
                    <span key={reading.label} title={reading.label} className='whitespace-nowrap'>
                      <span className='sr-only'>{reading.label} </span>
                      {reading.value}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>

            {model.bars.length ? (
              <div role='img' aria-label={model.barsLabel} data-slot='model-health' className='pointer-events-none absolute inset-x-0 bottom-0 flex h-[3px] gap-px'>
                {model.bars.map((bar, index) => (
                  <span key={index} className={cn('min-w-0 flex-1', !bar ? 'bg-foreground/8' : bar.ok ? 'bg-success/65' : 'bg-destructive')} />
                ))}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** Loading placeholders in the same grid, so the page does not jump when the models arrive. */
export function ModelCardsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy='true' className={grid}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className='surface-dense flex flex-col gap-3.5 p-4'>
          <div className='flex items-center gap-3'>
            <Skeleton className='size-9 rounded-2xl' />
            <div className='flex flex-1 flex-col gap-1.5'>
              <Skeleton className='h-4 w-2/3' />
              <Skeleton className='h-3 w-1/3' />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <Skeleton className='h-9 w-3/4' />
            <Skeleton className='h-9 w-3/4' />
          </div>
          <Skeleton className='h-3 w-1/2' />
        </div>
      ))}
    </div>
  )
}
