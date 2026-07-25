import type { ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'

import { router } from '@/app/router'
import { SiteLoadingScreen } from '@/components/shared/SiteLoadingScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SiteSettingsProvider, useSiteSettings } from '@/hooks/use-site-settings'

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
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    </SiteSettingsProvider>
  )
}
