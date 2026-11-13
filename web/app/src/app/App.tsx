import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'

import { router } from '@/app/router'
import { SiteLoadingScreen } from '@/components/shared/SiteLoadingScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SiteSettingsProvider, useSiteSettings } from '@/hooks/use-site-settings'
import { finishCaptcha, getCaptchaRequest, subscribeCaptcha } from '@/lib/auth/captcha'

const CaptchaDialog = lazy(() => import('@/components/shared/CaptchaDialog').then(m => ({ default: m.CaptchaDialog })))

function CaptchaHost() {
  const request = useSyncExternalStore(subscribeCaptcha, getCaptchaRequest, () => null)
  useEffect(() => {
    let path = router.state.location.pathname
    return router.subscribe(state => {
      if (state.location.pathname !== path) {
        path = state.location.pathname
        finishCaptcha()
      }
    })
  }, [])
  return request ? <Suspense fallback={<div role="status" className="fixed inset-0 flex items-center justify-center bg-background/90">正在加载安全验证…</div>}><CaptchaDialog /></Suspense> : null
}

function SiteSettingsGate({ children }: { children: ReactNode }) {
  const { status, retry } = useSiteSettings()

  if (status === 'loading') return <SiteLoadingScreen />
  if (status === 'error') return <SiteLoadingScreen error onRetry={retry} />
  return children
}

export function App() {
  return (
    <SiteSettingsProvider>
      <TooltipProvider>
        <SiteSettingsGate>
          <RouterProvider router={router} />
        </SiteSettingsGate>
        <CaptchaHost />
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    </SiteSettingsProvider>
  )
}
