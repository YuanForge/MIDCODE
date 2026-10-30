import { useEffect, useState } from 'react'
import { Gift, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { createHttpClient } from '@/lib/api/http'
import { Button } from '@/components/ui/button'
import './gift-arrival.css'
const http = createHttpClient('user')
type GiftNotice = { id: number; credits: number; created_at: string }
export function GiftArrival() {
  const { user } = useAuth()
  const [gift, setGift] = useState<GiftNotice | null>(null)
  useEffect(() => {
    setGift(null)
    if (!user?.id) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let seen = 0
    const key = `received-gift:${user.id}`
    try { seen = Number(localStorage.getItem(key)) || 0 } catch { /* private storage */ }
    async function check() {
      try {
        if (document.visibilityState === 'visible') {
          const result = await http.get<{ gift: GiftNotice | null }>('/user/credits/received-latest')
          if (!stopped && result.gift && result.gift.id > seen) {
            seen = result.gift.id
            try { localStorage.setItem(key, String(seen)) } catch { /* still deduplicate this session */ }
            setGift(result.gift)
          }
        }
      } catch { /* Retry quietly; billing history remains available. */ }
      finally { if (!stopped) timer = setTimeout(check, 30000) }
    }
    void check()
    return () => { stopped = true; clearTimeout(timer) }
  }, [user?.id])
  useEffect(() => {
    if (!gift) return
    const timer = setTimeout(() => setGift(null), 10000)
    return () => clearTimeout(timer)
  }, [gift])
  if (!gift) return null
  return <aside key={gift.id} className="gift-arrival fixed right-4 top-20 z-50 w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border bg-card p-6 text-card-foreground shadow-xl" role="status" aria-live="polite">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">{Array.from({ length: 16 }, (_, i) => <i key={i} className="gift-spark absolute size-2 rounded-full bg-primary" style={{ left: `${5 + i * 6}%`, animationDelay: `${(i % 5) * .12}s` }} />)}</div>
    <Button size="icon" variant="ghost" className="absolute right-2 top-2" aria-label="关闭到账提醒" onClick={() => setGift(null)}><X className="size-4" /></Button>
    <Gift className="gift-icon mb-3 size-10 text-primary" aria-hidden="true" />
    <p className="font-semibold">收到一份积分礼物</p>
    <p className="mt-1 text-sm text-muted-foreground">有人向你转赠了积分，已到账！</p>
    <p className="mt-3 text-2xl font-semibold text-primary">+ ¥{(gift.credits / 1e6).toFixed(6)}</p>
    <a href="/billing?tab=transactions" className="mt-3 inline-block text-sm underline">查看积分流水</a>
  </aside>
}
