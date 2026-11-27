import { useEffect, useState } from 'react'
import axios from 'axios'
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

type CalendarDay = { at: string; point?: UsagePoint; failed?: boolean }

function emptyYear(): CalendarDay[] {
  const today = Math.floor((Date.now() + beijing) / day) * day
  return Array.from({length:365}, (_, i) => ({ at: new Date(today - (364-i)*day).toISOString().slice(0,10) }))
}

function Calendar() {
  const [data, setData] = useState(emptyYear)
  const [attempt, retry] = useState(0)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  // A refresh remounts the calendar. A retry keeps all completed dates.
  const [completed] = useState(() => new Map<string, UsagePoint>())
  const [start] = useState(() => Date.parse(data[0].at+'T00:00:00+08:00'))
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setBusy(true)
    setError('')
    async function fetchBlock(lo: number, hi: number): Promise<void> {
      if (signal.aborted) return
      try {
        const result = await userApi.getUsageStats({
          start_at: new Date(start+lo*day).toISOString(),
          end_at: new Date(start+hi*day).toISOString(), bucket:'day', compare:false
        }, signal)
        if (signal.aborted) return
        if (result.points.length !== hi-lo) throw Error('返回的日期不完整')
        for (const point of result.points) completed.set(point.at.slice(0,10),point)
        setData(days => days.map(d => completed.has(d.at) ? {at:d.at,point:completed.get(d.at)} : d))
      } catch (err) {
        if (signal.aborted) return
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        if (hi-lo>1 && (status===500 || status===504 || (axios.isAxiosError(err) && err.code==='ECONNABORTED'))) {
          const mid = lo+Math.floor((hi-lo)/2)
          await fetchBlock(mid,hi)
          await fetchBlock(lo,mid)
          return
        }
        setData(days => days.map((d,i) => i>=lo && i<hi ? {...d,failed:true} : d))
        if (status !== 500 && status !== 504) throw err
      }
    }
    async function run() {
      for (let hi=365; hi>0 && !signal.aborted;) {
        const known = (i:number) => completed.has(new Date(start+i*day+beijing).toISOString().slice(0,10))
        if (known(hi-1)) { hi--; continue }
        let lo=hi-1
        while(lo>0 && hi-lo<7 && !known(lo-1)) lo--
        await fetchBlock(lo,hi)
        hi=lo
      }
    }
    run().catch(()=>{ if (!signal.aborted) setError('加载中断') }).finally(()=>{ if (!signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [attempt, completed, start])
  const loaded = data.filter(d=>d.point).length
  const complete = loaded === 365
  const [metric, setMetric] = useState<Metric>('requests')
  const [selected, select] = useState(364)
  const positive = data.map(p => p.point?.[metric] ?? 0).filter(n => n > 0).sort((a,b) => a-b)
  const cuts = [.25,.5,.75].map(q => positive[Math.floor((positive.length-1)*q)])
  const offset = data.length ? (new Date(data[0].at.slice(0,10)).getUTCDay()+6)%7 : 0
  const columns = Math.ceil((offset+data.length)/7)
  const selectedDay = data[selected]
  const grid = {gridTemplateColumns: 'repeat('+columns+',minmax(0,1fr))'}
  const sum = data.reduce((n,p) => n + (p.point?.[metric] ?? 0), 0)
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
    {!complete && <p className="mb-3 text-sm text-muted-foreground">{error} 已加载 {loaded}/365 天 {!busy && <Button onClick={() => retry(n=>n+1)}>重试未加载日期</Button>}</p>}
    <>
      <div className="mb-5 flex flex-wrap gap-x-10 gap-y-2">{[
        ['全年'+labels[metric], format(sum,metric),format(sum,metric,true)],
        ['活跃天数',positive.length+' 天',''],['单日峰值',format(peak,metric),format(peak,metric,true)]
      ].map(([label,value,title]) => <div key={label}><small className="text-muted-foreground">{label}</small><div title={complete ? title : undefined} className="text-2xl font-semibold tabular-nums">{complete ? value : "—"}</div></div>)}</div>
      <div className="overflow-x-auto pb-2"><div className="grid min-w-[740px] grid-cols-[2rem_1fr] gap-1">
        <div className="col-start-2 grid gap-1 text-xs text-muted-foreground" style={grid}>{data.map((p,i) => p.at.slice(8,10)==='01' && <span key={p.at} className="whitespace-nowrap" style={{gridColumn:1+Math.floor((offset+i)/7)}}>{Number(p.at.slice(5,7))}月</span>)}</div>
        <div className="grid grid-rows-7 items-center text-xs text-muted-foreground">{['周一','','周三','','周五','','周日'].map((v,i)=><span key={i}>{v}</span>)}</div>
        <div className="grid grid-rows-7 gap-1 p-px" style={grid}>{data.map((p,i)=>{
          const n=p.point?.[metric] ?? 0, label=p.at+' · '+(p.point ? format(n,metric,true) : p.failed ? '加载失败' : '待加载')
          return <button key={p.at} title={label} aria-label={label} onClick={()=>select(i)} onFocus={()=>select(i)} onMouseEnter={()=>select(i)}
            className={'aspect-square rounded-[3px] '+(selected===i?'outline outline-1 outline-foreground':'')}
            style={{gridColumn:1+Math.floor((offset+i)/7),gridRow:1+(offset+i)%7,background:p.point ? shades[n>0?1+cuts.filter(c=>n>c).length:0] : "repeating-linear-gradient(135deg,transparent 0 3px,var(--muted) 3px 5px)"}} />
        })}</div></div></div>
      <div className="mt-3 flex justify-between border-t pt-3 text-xs text-muted-foreground"><span>{selectedDay && selectedDay.at.slice(0,10)+' · '+(selectedDay.point ? format(selectedDay.point[metric],metric) : selectedDay.failed ? '加载失败' : '待加载')}</span>
        <span className="flex items-center gap-1">少 {shades.map(color=><i key={color} className="size-3 rounded-sm" style={{background:color}}/>)} 多</span></div>
    </>
  </section>
}

export function UsageCalendar({revision}: {revision:number}) {
  return <Calendar key={revision}/>
}
