import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TokenUsageRow } from '@/lib/api/user'
import { formatTokenCount, tokenSegments } from '@/lib/token-usage'

export function TokenUsageBarChart({ rows }: { rows: TokenUsageRow[] }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          <h2>按模型 Token 构成</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {tokenSegments.map((segment) => (
            <span key={segment.key} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${segment.className}`} aria-hidden="true" />
              {segment.label}
            </span>
          ))}
        </div>
        <div className="max-h-[440px] min-w-0 space-y-4 overflow-auto pr-1">
          {rows.map((row) => (
            <div key={row.model} className="grid min-w-[620px] grid-cols-[180px_minmax(320px,1fr)_110px] items-center gap-3">
              <div className="truncate font-mono text-xs" title={row.model}>{row.model}</div>
              <div
                className="flex h-7 overflow-hidden rounded-md bg-muted"
                role="img"
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
              <div className="text-right font-mono text-xs tabular-nums">{formatTokenCount(row.total_tokens)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
