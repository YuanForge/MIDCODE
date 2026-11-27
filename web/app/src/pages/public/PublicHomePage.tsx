import { useRef } from 'react'

import { BillingSection } from '@/pages/public/home/BillingSection'
import { FaqSection } from '@/pages/public/home/FaqSection'
import { FlowSection } from '@/pages/public/home/FlowSection'
import { HomeClosing, HomeFooter } from '@/pages/public/home/HomeClosing'
import { HomeHeader } from '@/pages/public/home/HomeHeader'
import { HomeHero } from '@/pages/public/home/HomeHero'
import { FeaturesSection, ModelsSection, WorkflowSection } from '@/pages/public/home/HomeSections'
import { TutorialSection } from '@/pages/public/home/TutorialSection'
import { useScrollProgress } from '@/hooks/use-scroll'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { getRoleToken } from '@/lib/auth/storage'

export function PublicHomePage() {
  const { settings } = useSiteSettings()
  const signedIn = Boolean(getRoleToken('user'))
  const { siteName, logoUrl } = settings
  const rootRef = useRef<HTMLDivElement>(null)
  useScrollProgress(rootRef)

  return (
    <div ref={rootRef} className='home-canvas min-h-screen overflow-x-clip text-foreground'>
      <i aria-hidden className='home-progress' />
      <i aria-hidden className='home-blob top-[-80px] left-[-120px] size-[480px]' />
      <i aria-hidden className='home-blob top-[140px] right-[-80px] size-[420px] [--blob-dur:32s] [--blob-mix:35%]' />
      <i aria-hidden className='home-blob bottom-[-180px] left-[35%] size-[380px] [--blob-dur:36s] [--blob-mix:20%]' />
      <div className='relative z-10'>
        <HomeHeader siteName={siteName} logoUrl={logoUrl} signedIn={signedIn} />
        <main>
          <HomeHero signedIn={signedIn} />
          <FlowSection />
          <TutorialSection />
          <FeaturesSection />
          <ModelsSection />
          <WorkflowSection />
          <BillingSection />
          <FaqSection />
          <HomeClosing signedIn={signedIn} />
        </main>
        <HomeFooter siteName={siteName} />
      </div>
    </div>
  )
}
