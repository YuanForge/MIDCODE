import { useEffect, useRef } from 'react'
import { ArrowUpIcon } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'

// Scalar draws its own interface inside this page, so it opens in whichever theme the site is in.
function scalarConfiguration() {
  return JSON.stringify({
    theme: 'default',
    darkMode: document.documentElement.classList.contains('dark'),
    layout: 'sidebar',
    hideDarkModeToggle: true,
  })
}

/** API reference: the title, a slim bar to jump back to the top, then the Scalar reference filling the page. */
export function UserDocsPage() {
  const scalarRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = scalarRootRef.current
    if (!root) {
      return undefined
    }

    const reference = document.createElement('div')
    reference.id = 'api-reference'
    reference.setAttribute('data-url', '/openapi-user.json')
    reference.setAttribute('data-configuration', scalarConfiguration())
    root.replaceChildren(reference)

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
    script.async = true
    document.head.appendChild(script)

    return () => {
      script.remove()
      root.replaceChildren()
    }
  }, [])

  return (
    <div className='min-w-0'>
      <div className='px-5 py-8 md:px-10'>
        <PageHeader title='接口文档' description='浏览用户 API 的请求参数、响应结构和在线示例。' />
      </div>
      <div className='sticky top-12 z-10 flex items-center justify-between gap-3 border-y border-glass-border glass-bar px-5 py-2 md:top-0 md:px-10'>
        <p className='text-xs text-muted-foreground'>文档较长时可随时回到顶部查看左侧目录。</p>
        <Button size='sm' variant='ghost' className='shrink-0' onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <ArrowUpIcon data-icon='inline-start' />
          回到顶部
        </Button>
      </div>
      <div ref={scalarRootRef} className='min-h-[calc(100vh-11rem)] min-w-0' data-testid='scalar-root' />
    </div>
  )
}
