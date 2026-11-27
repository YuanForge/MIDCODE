import { useState } from 'react'
import { useAsync } from '@/hooks/use-async'
import { userApi, type UsagePoint } from '@/lib/api/user'
import { Button } from '@/components/ui/button'

const day = 86400000
const beijing = 8 * 3600000
const labels = { requests: '调用次数', credits: '消费金额', total_tokens: 'Token 用量' }
type Metric = keyof typeof labels
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })
const shades = ['var(--muted)', ...[22, 45, 70, 100].map(n => 'color-mix(in srgb, var(--primary) '+n+'%, var(--card))')]

function format(n: number, metric: Metric, exact = false) {
  if (metric === 'credits') return '¥' + (n / 1e6).toLocaleString('zh-CN', { maximumFractionDigits: exact ? 6 : 4 })
  if (metric === 'total_tokens') return (exact ? n.toLocaleString('en-US') : compact.format(n)) + ' Tokens'
  return n.toLocaleString('zh-CN') + ' 次'
}

async function fetchYear() {
  const today = Math.floor((Date.now() + beijing) / day) * day - beijing
  const end = today + day
  const points: UsagePoint[] = []
  // The API accepts at most 90 days per request. Fetch contiguous Beijing days.
  for (let start = end - 365 * day; start < end; start += 90 * day) {
    const result = await userApi.getUsageStats({ start_at: new Date(start).toISOString(),
      end_at: new Date(Math.min(start + 90 * day, end)).toISOString(), bucket: 'day' })
    points.push(...result.points)
  }
  return points
}

export function UsageCalendar({ revision }: { revision: number }) {
  const { data, loading, error, reload } = useAsync(fetchYear, [] as UsagePoint[], [revision])
  const [metric, setMetric] = useState<Metric>('requests')
  const [selected, select] = useState(364)
  const positive = data.map(p => p[metric]).filter(n => n > 0).sort((a,b) => a-b)
  const cuts = [.25,.5,.75].map(q => positive[Math.floor((positive.length-1)*q)])
  const offset = data.length ? (new Date(data[0].at.slice(0,10)).getUTCDay()+6)%7 : 0
  const columns = Math.ceil((offset+data.length)/7)
  const selectedDay = data[selected]
  const grid = {gridTemplateColumns: 'repeat('+columns+',minmax(0,1fr))'}
  const sum = data.reduce((n,p) => n + p[metric], 0)
  const peak = positive.at(-1) ?? 0
  return <section className="rounded-xl border bg-card p-5 sm:p-7" aria-label="使用热力图">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">使用热力图</h2>
      {data.length > 0 && <small>{data[0].at.slice(0,10)} — {data[data.length-1].at.slice(0,10)} · 北京时间</small>}</div>
    <div role="group" aria-label="热力图统计指标" className="my-4 flex flex-wrap gap-x-5">
      {(Object.keys(labels) as Metric[]).map(key => (
        <button
          key={key}
          type="button"
          aria-pressed={metric === key}
          onClick={() => setMetric(key)}
          className="min-h-10 cursor-pointer border-b-2 border-transparent px-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:text-primary"
        >
          {labels[key]}
        </button>
      ))}
    </div>
    {error ? <p role="alert">{error} <Button onClick={reload}>重试</Button></p> : loading ? <p role="status">正在加载全年用量…</p> : <>
      <div className="mb-5 flex flex-wrap gap-x-10 gap-y-2">{[
        ['全年'+labels[metric], format(sum,metric),format(sum,metric,true)],
        ['活跃天数',positive.length+' 天',''],['单日峰值',format(peak,metric),format(peak,metric,true)]
      ].map(([label,value,title]) => <div key={label}><small className="text-muted-foreground">{label}</small><div title={title} className="text-2xl font-semibold tabular-nums">{value}</div></div>)}</div>
      <div className="overflow-x-auto pb-2"><div className="grid min-w-[740px] grid-cols-[2rem_1fr] gap-1">
        <div className="col-start-2 grid gap-1 text-xs text-muted-foreground" style={grid}>{data.map((p,i) => p.at.slice(8,10)==='01' && <span key={p.at} className="whitespace-nowrap" style={{gridColumn:1+Math.floor((offset+i)/7)}}>{Number(p.at.slice(5,7))}月</span>)}</div>
        <div className="grid grid-rows-7 items-center text-xs text-muted-foreground">{['周一','','周三','','周五','','周日'].map((v,i)=><span key={i}>{v}</span>)}</div>
        <div className="grid grid-rows-7 gap-1 p-px" style={grid}>{data.map((p,i)=>{
          const n=p[metric], label=p.at.slice(0,10)+' · '+format(n,metric,true)
          return <button key={p.at} title={label} aria-label={label} onClick={()=>select(i)} onFocus={()=>select(i)} onMouseEnter={()=>select(i)}
            className={'aspect-square rounded-[3px] '+(selected===i?'outline outline-1 outline-foreground':'')}
            style={{gridColumn:1+Math.floor((offset+i)/7),gridRow:1+(offset+i)%7,background:shades[n>0?1+cuts.filter(c=>n>c).length:0]}} />
        })}</div></div></div>
      <div className="mt-3 flex justify-between border-t pt-3 text-xs text-muted-foreground"><span>{selectedDay && selectedDay.at.slice(0,10)+' · '+format(selectedDay[metric],metric)}</span>
        <span className="flex items-center gap-1">少 {shades.map(color=><i key={color} className="size-3 rounded-sm" style={{background:color}}/>)} 多</span></div>
    </>}
  </section>
}
