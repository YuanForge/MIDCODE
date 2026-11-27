import { useEffect, useRef } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'

const scalarConfiguration = JSON.stringify({
  theme: 'default',
  darkMode: false,
  layout: 'sidebar',
  hideDarkModeToggle: true,
})

export function UserDocsPage() {
  const scalarRootRef = useRef<HTMLDivElement>(null)

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const root = scalarRootRef.current
    if (!root) {
      return undefined
    }

    const reference = document.createElement('div')
    reference.id = 'api-reference'
    reference.setAttribute('data-url', '/openapi-user.json')
    reference.setAttribute('data-configuration', scalarConfiguration)
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
    <div className="min-w-0 bg-background">
      <div className="px-4 py-5 md:px-6">
        <PageHeader
          eyebrow="Reference"
          title="接口文档"
          description="浏览用户 API 的请求参数、响应结构和在线示例。"
        />
      </div>
      <div className="sticky top-[58px] z-10 flex items-center justify-between gap-3 border-y bg-background/95 px-4 py-2 backdrop-blur md:px-6">
        <p className="text-xs text-muted-foreground">文档较长时可随时回到顶部查看左侧目录。</p>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={scrollToTop}>回到顶部</Button>
      </div>
      <div
        ref={scalarRootRef}
        className="min-h-[calc(100vh-11rem)] min-w-0"
        data-testid="scalar-root"
      />
    </div>
  )
}
