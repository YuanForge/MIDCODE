import { Section } from '@/components/shared/Section'
import type { TokenUsageRow } from '@/lib/api/user'
import { formatTokenCount, tokenSegments } from '@/lib/token-usage'

/**
 * Per-model Token makeup: one ruled row per model, with the bar split into its segments.
 * Every number is that model's own count, so nothing is added up across models.
 */
export function TokenUsageBarChart({ rows }: { rows: TokenUsageRow[] }) {
  return (
    <Section title='按模型 Token 构成'>
      <div className='flex flex-col gap-4'>
        <ul className='flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground'>
          {tokenSegments.map((segment) => (
            <li key={segment.key} className='inline-flex items-center gap-1.5'>
              <span className={`size-2.5 rounded-sm ${segment.className}`} aria-hidden='true' />
              {segment.label}
            </li>
          ))}
        </ul>
        <div className='glass max-h-[440px] min-w-0 overflow-auto px-4'>
          <ul className='min-w-[620px] divide-y divide-glass-border'>
            {rows.map((row) => (
              <li key={row.model} className='grid grid-cols-[180px_minmax(320px,1fr)_110px] items-center gap-3 py-3'>
                <div className='truncate font-mono text-xs' title={row.model}>
                  {row.model}
                </div>
                <div
                  className='flex h-5 gap-px overflow-hidden rounded-[3px] bg-glass-strong'
                  role='img'
                  aria-label={`${row.model} Token 构成`}
                >
                  {tokenSegments.map((segment) => {
                    const value = row[segment.key] as number
                    if (value <= 0) return null
                    return (
                      <div
                        key={segment.key}
                        className={segment.className}
                        style={{ width: `${(value / Math.max(row.total_tokens, 1)) * 100}%` }}
                        title={`${segment.label}: ${formatTokenCount(value)}`}
                      />
                    )
                  })}
                </div>
                <div className='text-right font-mono text-xs text-foreground tabular-nums'>{formatTokenCount(row.total_tokens)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}
