import type { ComponentType, CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BlocksIcon,
  BookOpenIcon,
  ImageIcon,
  MessageSquareTextIcon,
  MusicIcon,
  RadioTowerIcon,
  VideoIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ApiDemo, type DemoEndpoint } from '@/pages/public/home/ApiDemo'

type Capability = { label: string; Icon: ComponentType<{ className?: string }> }

const stagger = (index: number) => ({ '--i': index }) as CSSProperties
const LINE_END = ' \\\n'
const edge = 'px-[clamp(1.5rem,4vw,4rem)]'

/**
 * Hero: the headline rises out of a mask, then the real request shapes are typed out beside it. Nothing here is
 * sample data: the paths are the gateway's own and the host is this site's origin.
 */
export function HomeHero({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const capabilities: Capability[] = [
    { label: t('home.capabilityText'), Icon: MessageSquareTextIcon },
    { label: t('home.capabilityImage'), Icon: ImageIcon },
    { label: t('home.capabilityVideo'), Icon: VideoIcon },
    { label: t('home.capabilityMusic'), Icon: MusicIcon },
    { label: t('home.capabilityAsync'), Icon: RadioTowerIcon },
  ]
  const auth = '  -H "Authorization: Bearer YOUR_API_KEY"'
  const json = '  -H "Content-Type: application/json"'
  const endpoints: DemoEndpoint[] = [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      label: t('home.capabilityText'),
      code: [
        `curl ${origin}/v1/chat/completions`,
        auth,
        json,
        `  -d '{\n    "model": "MODEL_ID",\n    "messages": [{"role": "user", "content": "Hello"}]\n  }'`,
      ].join(LINE_END),
    },
    {
      method: 'POST',
      path: '/v1/images/generations',
      label: t('home.capabilityImage'),
      code: [
        `curl ${origin}/v1/images/generations`,
        auth,
        json,
        `  -d '{"model": "MODEL_ID", "prompt": "A lighthouse at dawn"}'`,
      ].join(LINE_END),
    },
    {
      method: 'GET',
      path: '/v1/tasks/{id}',
      label: t('home.capabilityAsync'),
      code: [`curl ${origin}/v1/tasks/TASK_ID`, auth].join(LINE_END),
    },
  ]
  // The track holds two identical groups and slides by half its width, so the loop has no seam.
  const track = [0, 1, 2].flatMap((copy) => capabilities.map((item) => ({ ...item, key: `${copy}-${item.label}` })))

  return (
    <>
      <section
        className={`grid items-center gap-10 pt-[clamp(2rem,5vw,4.5rem)] lg:min-h-[640px] lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14 ${edge}`}
      >
        <div className='flex min-w-0 flex-col'>
          <h1 className='text-[clamp(2.5rem,5.4vw,5.5rem)] leading-[1.1] font-extrabold tracking-[-0.04em] text-balance text-foreground [word-break:keep-all] [overflow-wrap:anywhere]'>
            <span className='block overflow-hidden pb-[0.12em]'>
              <span className='home-line'>{t('home.headline')}</span>
            </span>
          </h1>
          <p className='home-fade mt-6 max-w-xl text-lg leading-8 text-muted-foreground' style={stagger(2)}>
            {t('home.subhead')}
          </p>
          <div className='home-fade mt-8 flex flex-wrap items-center gap-3' style={stagger(3)}>
            <Button asChild size='lg' className='shine'>
              <Link to={signedIn ? '/dashboard' : '/register'}>
                {signedIn ? t('home.primaryCtaSignedIn') : t('home.primaryCtaGuest')}
              </Link>
            </Button>
            <Button asChild size='lg' variant='outline' className='border-glass-border bg-glass-strong backdrop-blur-sm'>
              <Link to='/models'>
                <BlocksIcon data-icon='inline-start' />
                {t('home.viewModels')}
              </Link>
            </Button>
            <Button asChild size='lg' variant='ghost' className='text-muted-foreground hover:text-foreground max-sm:px-0!'>
              <Link to='/docs'>
                <BookOpenIcon data-icon='inline-start' />
                {t('home.readDocs')}
              </Link>
            </Button>
          </div>
        </div>
        <div className='home-fade min-w-0' style={stagger(4)}>
          <ApiDemo endpoints={endpoints} copyLabel={t('common.copyCode')} />
        </div>
      </section>

      <div className='glass mx-[clamp(1.5rem,4vw,4rem)] mt-[clamp(2.5rem,6vw,4.5rem)] overflow-hidden py-4'>
        <div className='home-marquee'>
          {[0, 1].map((group) => (
            <ul key={group} aria-hidden={group === 1} className='flex shrink-0'>
              {track.map(({ key, label, Icon }) => (
                <li
                  key={key}
                  className='inline-flex items-center gap-3 px-7 text-lg font-bold whitespace-nowrap text-muted-foreground'
                >
                  <Icon className='size-4 text-primary/70' />
                  {label}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </>
  )
}
