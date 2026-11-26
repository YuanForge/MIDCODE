import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

/** Closing band: a full-width paper strip with the one decision left, not a floating card. */
export function HomeClosing({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation()
  return (
    <section className='border-t border-border bg-card py-16 lg:py-20'>
      <div className='mx-auto flex max-w-6xl flex-col gap-8 px-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between'>
        <div className='max-w-2xl'>
          <h2 className='text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance text-foreground'>
            {t('home.finalTitle')}
          </h2>
          <p className='mt-3 text-[15px] leading-7 text-muted-foreground'>{t('home.finalDesc')}</p>
        </div>
        <div className='flex shrink-0 flex-wrap gap-3'>
          <Button asChild size='lg'>
            <Link to={signedIn ? '/dashboard' : '/register'}>
              {signedIn ? t('home.primaryCtaSignedIn') : t('home.registerAccount')}
            </Link>
          </Button>
          {signedIn ? null : (
            <Button asChild size='lg' variant='outline'>
              <Link to='/login'>{t('common.login')}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

export function HomeFooter({ siteName }: { siteName: string }) {
  const { t } = useTranslation()
  return (
    <footer className='border-t border-border py-8'>
      <div className='mx-auto flex max-w-6xl flex-col gap-4 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8'>
        <span>{siteName}</span>
        <div className='flex gap-5'>
          <Link to='/models' className='hover:text-foreground'>
            {t('home.footerProduct')}
          </Link>
          <Link to='/docs' className='hover:text-foreground'>
            {t('common.docs')}
          </Link>
          <Link to='/login' className='hover:text-foreground'>
            {t('common.login')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
