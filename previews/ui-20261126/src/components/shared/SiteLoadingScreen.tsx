import { NetworkIcon, RefreshCwIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import './site-loading-screen.css'

export function SiteLoadingScreen({ error = false, onRetry }: { error?: boolean; onRetry?: () => void }) {
  return (
    <main className="neutral-site-loading-screen" aria-busy={!error}>
      {error ? (
        <div className="site-loading-error" role="alert">
          <p>站点配置加载失败</p>
          <span>请检查网络连接后重新尝试</span>
          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCwIcon data-icon="inline-start" />
            重新加载
          </Button>
        </div>
      ) : (
        <div className="site-loading-geometry" role="status" aria-label="正在连接服务">
          <div className="site-loading-symbol" aria-hidden>
            <div className="site-loading-ring" />
            <div className="site-loading-ring site-loading-ring-inner" />
            <div className="site-loading-diamond"><NetworkIcon /></div>
          </div>
          <p>正在连接服务</p>
          <span>配置完成后自动进入</span>
        </div>
      )}
    </main>
  )
}
