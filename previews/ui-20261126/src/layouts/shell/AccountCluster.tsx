import type { ComponentType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, LogOutIcon, MessageCircleIcon, SettingsIcon, UserRoundIcon, UsersRoundIcon } from 'lucide-react'

import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useSiteSettings } from '@/hooks/use-site-settings'
import type { ConsoleRole } from '@/layouts/nav-config'
import { getRoleToken, setSiteModePreference } from '@/lib/auth/storage'

const quiet = 'text-muted-foreground hover:text-foreground'

function ContactButton({
  imageUrl,
  label,
  description,
  Icon,
}: {
  imageUrl: string
  label: string
  description: string
  Icon: ComponentType<{ className?: string }>
}) {
  if (!imageUrl) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant='ghost' size='icon-sm' className={quiet} aria-label={label} title={label}>
          <Icon className='size-4' />
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[300px]'>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='flex justify-center'>
          <img src={imageUrl} alt={label} className='size-52 rounded-lg border bg-white object-contain p-2' />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Right end of the top bar: contact codes, language, theme and the account menu. The balance sits at the foot of the rail. The theme toggle appears here and nowhere else. */
export function AccountCluster({
  role,
  displayName,
  accountName,
  onLogout,
}: {
  role: ConsoleRole
  displayName?: string
  accountName: string
  onLogout: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useSiteSettings()
  const isLoggedIn = Boolean(getRoleToken(role))
  const text = (key: string, fallback: string) => (role === 'user' ? t(key) : fallback)
  const initial = (displayName ?? role).slice(0, 1).toUpperCase()

  return (
    <div className='flex shrink-0 items-center gap-1'>
      <span className='hidden items-center sm:flex'>
        <ContactButton imageUrl={settings.qqGroupUrl} label={text('layout.qqGroup', 'QQ 交流群')} description={text('layout.qqGroupDesc', '扫码加入 QQ 交流群')} Icon={UsersRoundIcon} />
        <ContactButton imageUrl={settings.wechatCsUrl} label={text('layout.wechatSupport', '微信客服')} description={text('layout.wechatSupportDesc', '扫码添加微信客服')} Icon={MessageCircleIcon} />
        {role === 'user' ? <LanguageSwitcher className={quiet} /> : null}
      </span>
      <ThemeToggle />
      {isLoggedIn ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='sm' className='gap-1.5 pr-2 pl-1.5' aria-label={accountName}>
              <Avatar className='size-5'>
                <AvatarFallback className='bg-accent text-[11px] font-semibold text-accent-foreground'>{initial}</AvatarFallback>
              </Avatar>
              <span className='hidden max-w-24 truncate md:inline'>{accountName}</span>
              <ChevronDownIcon className='size-3.5 text-muted-foreground transition-transform duration-200 ease-out group-aria-expanded/button:rotate-180' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side='bottom' align='end' className='w-48'>
            {role === 'admin' ? (
              <DropdownMenuItem
                onClick={() => {
                  setSiteModePreference('user')
                  navigate('/dashboard')
                }}
              >
                <UserRoundIcon data-icon='inline-start' />
                用户端
              </DropdownMenuItem>
            ) : null}
            {role === 'user' && getRoleToken('admin') ? (
              <DropdownMenuItem
                onClick={() => {
                  setSiteModePreference('admin')
                  navigate('/admin/dashboard')
                }}
              >
                <SettingsIcon data-icon='inline-start' />
                {t('layout.adminConsole')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onLogout}>
              <LogOutIcon data-icon='inline-start' />
              {text('layout.logout', '退出登录')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : role === 'user' ? (
        <div className='flex items-center gap-1.5'>
          <Button asChild size='sm'>
            <Link to='/login'>{t('common.login')}</Link>
          </Button>
          <Button asChild size='sm' variant='outline' className='hidden sm:inline-flex'>
            <Link to='/register'>{t('common.register')}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
