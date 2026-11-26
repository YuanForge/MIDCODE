import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MessageCircleIcon,
  SettingsIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from 'lucide-react'

import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSiteSettings } from '@/hooks/use-site-settings'
import type { ConsoleRole } from '@/layouts/nav-config'
import { userApi } from '@/lib/api/user'
import { getRoleToken, setSiteModePreference } from '@/lib/auth/storage'

const quiet = 'text-muted-foreground hover:text-foreground'

/** The balance is the one number every user page needs, so it sits at the foot of the rail as a plain reading. */
function BalanceReadout() {
  const { t } = useTranslation()
  const [balance, setBalance] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    userApi
      .getBalance()
      .then((res) => {
        if (!cancelled) setBalance(res.balance_credits ?? 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  if (balance == null) return null
  return (
    <Link
      to='/billing'
      title={t('layout.topupTitle')}
      className='flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-sm font-semibold tabular-nums outline-none transition-colors duration-140 hover:border-input-hover focus-visible:ring-3 focus-visible:ring-ring/40'
    >
      ¥{(balance / 1e6).toFixed(2)}
    </Link>
  )
}

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

export function RailAccount({
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
    <div className='flex flex-col gap-3'>
      {isLoggedIn && role === 'user' ? <BalanceReadout /> : null}
      <div className='flex items-center gap-0.5'>
        <ContactButton
          imageUrl={settings.qqGroupUrl}
          label={text('layout.qqGroup', 'QQ 交流群')}
          description={text('layout.qqGroupDesc', '扫码加入 QQ 交流群')}
          Icon={UsersRoundIcon}
        />
        <ContactButton
          imageUrl={settings.wechatCsUrl}
          label={text('layout.wechatSupport', '微信客服')}
          description={text('layout.wechatSupportDesc', '扫码添加微信客服')}
          Icon={MessageCircleIcon}
        />
        {role === 'user' ? <LanguageSwitcher className={quiet} /> : null}
        <ThemeToggle />
      </div>
      {isLoggedIn ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='sm' className='w-full justify-start gap-2 px-1.5' aria-label={accountName}>
              <Avatar className='size-6'>
                <AvatarFallback className='bg-accent text-xs font-semibold text-accent-foreground'>{initial}</AvatarFallback>
              </Avatar>
              <span className='min-w-0 flex-1 truncate text-left'>{accountName}</span>
              <ChevronsUpDownIcon className='size-3.5 text-muted-foreground' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side='top' align='start' className='w-48'>
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
        <div className='flex flex-col gap-2'>
          <Button asChild className='w-full'>
            <Link to='/login'>{t('common.login')}</Link>
          </Button>
          <Button asChild variant='outline' className='w-full'>
            <Link to='/register'>{t('common.register')}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
