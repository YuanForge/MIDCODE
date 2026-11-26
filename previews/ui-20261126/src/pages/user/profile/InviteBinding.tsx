import { useState } from 'react'
import { UserPlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { SettingRow } from '@/components/shared/SettingRow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { userApi, type InviteInfo } from '@/lib/api/user'

/** Inviter binding: shows who the account is bound to, or lets a new account fill in a code within the deadline. */
export function InviteBinding() {
  const { data: info, loading, error: loadError, reload } = useAsync(() => userApi.getInviteInfo(), {} as InviteInfo)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function bind() {
    const trimmed = code.trim()
    if (!trimmed) {
      setError('请输入邀请码')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await userApi.bindInviteCode(trimmed)
      toast.success('邀请码绑定成功')
      setCode('')
      reload()
    } catch (err) {
      const message = getApiErrorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SettingRow title='邀请关系' description='注册七天内且尚未绑定上级时，可以补填邀请码。'>
      <div className='flex flex-col gap-4'>
        {loadError ? (
          <Alert variant='destructive'>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className='h-10 w-full' />
        ) : info.inviter_id ? (
          <p className='flex items-start gap-2 text-sm'>
            <UserPlusIcon aria-hidden className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
            已绑定上级用户 UID #{info.inviter_id}，邀请关系不可重复修改。
          </p>
        ) : info.can_bind ? (
          <>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void bind()}
                placeholder='请输入上级邀请码'
                aria-label='上级邀请码'
              />
              <Button onClick={() => void bind()} disabled={submitting} className='shrink-0'>
                <UserPlusIcon data-icon='inline-start' />
                {submitting ? '绑定中…' : '绑定邀请码'}
              </Button>
            </div>
            {info.binding_deadline ? (
              <p className='text-xs text-muted-foreground'>绑定截止：{new Date(info.binding_deadline).toLocaleString()}</p>
            ) : null}
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>当前账号已超过绑定期限，或暂时无法补填邀请码。</p>
        )}
      </div>
    </SettingRow>
  )
}
