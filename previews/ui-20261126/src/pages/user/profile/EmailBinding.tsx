import { MailIcon } from 'lucide-react'

import { SettingRow } from '@/components/shared/SettingRow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { UserProfileResponse } from '@/lib/api/user'
import { useEmailBinding } from '@/pages/user/profile/useEmailBinding'

/** Email binding: either the bound address as one line, or the short form to bind one. */
export function EmailBinding({
  profile,
  loading,
  onBound,
}: {
  profile: UserProfileResponse | null
  loading: boolean
  onBound: () => void
}) {
  const form = useEmailBinding({ username: profile?.username, onBound })

  return (
    <SettingRow title='邮箱绑定' description='绑定邮箱后可用于账户验证和找回密码。'>
      <div className='flex flex-col gap-4'>
        {form.error ? (
          <Alert variant='destructive'>
            <AlertDescription>{form.error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className='h-10 w-full' />
        ) : profile?.email ? (
          <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
            <MailIcon aria-hidden className='size-4 shrink-0 text-muted-foreground' />
            <span className='font-medium text-foreground'>{profile.email}</span>
            <span className='text-muted-foreground'>已绑定，可用于找回密码</span>
          </p>
        ) : (
          <>
            {form.isEmailUsername ? (
              <p className='text-sm text-muted-foreground'>
                将向 <span className='font-medium text-foreground'>{profile?.username}</span> 发送验证码
              </p>
            ) : (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='email-address'>邮箱地址</Label>
                <Input
                  id='email-address'
                  type='email'
                  value={form.email}
                  onChange={(event) => form.setEmail(event.target.value)}
                  placeholder='example@email.com'
                  autoComplete='email'
                />
              </div>
            )}
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='email-code'>验证码</Label>
              <div className='flex gap-2'>
                <Input
                  id='email-code'
                  value={form.code}
                  onChange={(event) => form.setCode(event.target.value)}
                  placeholder='6 位验证码'
                  autoComplete='one-time-code'
                  className='flex-1'
                />
                <Button variant='outline' disabled={form.countdown > 0} onClick={() => void form.sendCode()} className='shrink-0'>
                  {form.countdown > 0 ? `${form.countdown}s` : '发送验证码'}
                </Button>
              </div>
            </div>
            <Button className='w-full sm:w-fit' onClick={() => void form.bind()} disabled={form.binding}>
              {form.binding ? '绑定中…' : '绑定邮箱'}
            </Button>
          </>
        )}
      </div>
    </SettingRow>
  )
}
