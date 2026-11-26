import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ActivityIcon,
  Code2Icon,
  ImageIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  MusicIcon,
  NetworkIcon,
  TerminalSquareIcon,
  VideoIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

type Row = { titleKey: string; descriptionKey: string; Icon: ComponentType<{ className?: string }> }

const features: Row[] = [
  { titleKey: 'home.featureGatewayTitle', descriptionKey: 'home.featureGatewayDesc', Icon: NetworkIcon },
  { titleKey: 'home.featureKeysTitle', descriptionKey: 'home.featureKeysDesc', Icon: KeyRoundIcon },
  { titleKey: 'home.featureObserveTitle', descriptionKey: 'home.featureObserveDesc', Icon: ActivityIcon },
  { titleKey: 'home.featureProtocolTitle', descriptionKey: 'home.featureProtocolDesc', Icon: Code2Icon },
]

const modelKinds: Row[] = [
  { titleKey: 'home.llmTitle', descriptionKey: 'home.llmDesc', Icon: MessageSquareTextIcon },
  { titleKey: 'home.imageTitle', descriptionKey: 'home.imageDesc', Icon: ImageIcon },
  { titleKey: 'home.videoTitle', descriptionKey: 'home.videoDesc', Icon: VideoIcon },
  { titleKey: 'home.musicTitle', descriptionKey: 'home.musicDesc', Icon: MusicIcon },
]

// The steps really are a sequence (create a key, pick a model, watch usage), so they are numbered.
const workflow = [
  { titleKey: 'home.workflowKeyTitle', descriptionKey: 'home.workflowKeyDesc' },
  { titleKey: 'home.workflowModelTitle', descriptionKey: 'home.workflowModelDesc' },
  { titleKey: 'home.workflowMonitorTitle', descriptionKey: 'home.workflowMonitorDesc' },
]

const heading = 'text-3xl leading-tight font-semibold tracking-[-0.02em] text-balance text-foreground'
const stickyIntro = 'flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start'

export function FeaturesSection() {
  const { t } = useTranslation()
  return (
    <section id='features' className='scroll-mt-16 py-20 lg:py-24'>
      <div className='mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16'>
        <div className={stickyIntro}>
          <h2 className={heading}>{t('home.coreTitle')}</h2>
          <p className='text-base leading-7 text-muted-foreground'>{t('home.coreDesc')}</p>
        </div>
        <ul className='flex flex-col divide-y divide-border border-y border-rule'>
          {features.map(({ titleKey, descriptionKey, Icon }) => (
            <li key={titleKey} className='grid gap-2 py-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8'>
              <h3 className='flex items-center gap-2.5 text-base font-semibold text-foreground'>
                <Icon className='size-4 text-muted-foreground' />
                {t(titleKey)}
              </h3>
              <p className='text-sm leading-6 text-muted-foreground'>{t(descriptionKey)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function ModelsSection() {
  const { t } = useTranslation()
  return (
    <section id='models' className='scroll-mt-16 border-y border-border bg-card py-20 lg:py-24'>
      <div className='mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16'>
        <div className={stickyIntro}>
          <h2 className={heading}>{t('home.modelHubTitle')}</h2>
          <p className='text-base leading-7 text-muted-foreground'>{t('home.modelHubDesc')}</p>
          <div className='mt-4 flex flex-wrap gap-3'>
            <Button asChild>
              <Link to='/models'>{t('home.browseModels')}</Link>
            </Button>
            <Button asChild variant='outline'>
              <Link to='/docs'>
                <TerminalSquareIcon data-icon='inline-start' />
                {t('home.apiDocs')}
              </Link>
            </Button>
          </div>
        </div>
        <ul className='flex flex-col divide-y divide-border border-y border-rule'>
          {modelKinds.map(({ titleKey, descriptionKey, Icon }) => (
            <li key={titleKey} className='flex gap-4 py-6'>
              <Icon className='mt-1 size-5 shrink-0 text-muted-foreground' />
              <div className='flex flex-col gap-1'>
                <h3 className='text-base font-semibold text-foreground'>{t(titleKey)}</h3>
                <p className='text-sm leading-6 text-muted-foreground'>{t(descriptionKey)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function WorkflowSection() {
  const { t } = useTranslation()
  return (
    <section id='workflow' className='scroll-mt-16 py-20 lg:py-24'>
      <div className='mx-auto max-w-6xl px-5 sm:px-8'>
        <h2 className={`${heading} mb-12 max-w-2xl`}>{t('home.workflowTitle')}</h2>
        <ol className='grid gap-x-10 gap-y-8 md:grid-cols-3'>
          {workflow.map(({ titleKey, descriptionKey }, index) => (
            <li key={titleKey} className='flex flex-col gap-3 border-t border-rule pt-5'>
              <span className='text-sm font-medium text-muted-foreground tabular-nums'>{index + 1}</span>
              <h3 className='text-base font-semibold text-foreground'>{t(titleKey)}</h3>
              <p className='text-sm leading-6 text-muted-foreground'>{t(descriptionKey)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
