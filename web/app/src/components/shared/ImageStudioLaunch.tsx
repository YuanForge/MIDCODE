import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LoaderCircleIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { createHttpClient, getApiErrorMessage } from '@/lib/api/http'

const http = createHttpClient('user')

// Only https addresses are followed; plain http is accepted for a local studio on localhost or 127.0.0.1.
function isAllowedTarget(target: URL) {
  if (target.protocol === 'https:') return true
  return target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)
}

/**
 * Hands the person over to the image studio. The handoff request is repeated whenever the prompt changes or
 * the person retries, and a stale request is aborted so a late answer can never redirect twice.
 */
export function ImageStudioLaunch({ prompt = '' }: { prompt?: string }) {
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    http
      .post<{ url: string }>('/user/image-studio/handoff', { all_keys: true, prompt }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        const target = new URL(result.url)
        if (!isAllowedTarget(target)) throw new Error('图片工作台地址无效')
        window.location.replace(target.href)
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(err))
      })
    return () => controller.abort()
  }, [prompt, attempt])

  function retry() {
    setError('')
    setAttempt((value) => value + 1)
  }

  return (
    <div data-slot='image-studio-launch' className='glass flex max-w-xl flex-col gap-5 p-6'>
      {error ? (
        <>
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className='flex flex-wrap items-center gap-3'>
            <Button onClick={retry}>重新进入</Button>
            <Button asChild variant='outline'>
              <Link to='/keys'>管理 API 密钥</Link>
            </Button>
          </div>
        </>
      ) : (
        <p role='status' className='flex items-center gap-2.5 text-sm text-muted-foreground'>
          <LoaderCircleIcon aria-hidden className='size-4 animate-spin' />
          正在进入图片工作台…
        </p>
      )}
    </div>
  )
}
