import { useEffect, useRef } from 'react'

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
    <div className="space-y-3">
      <div className="sticky top-2 z-20 flex items-center justify-between rounded-xl border border-border/70 bg-background/90 px-3 py-2 backdrop-blur">
        <p className="text-xs text-muted-foreground">文档较长时可随时回到顶部查看左侧目录</p>
        <button type="button" className="text-xs text-primary hover:underline" onClick={scrollToTop}>回到顶部</button>
      </div>
      <div className="rounded-[28px] border border-border/70 bg-background shadow-sm">
      <div
        ref={scalarRootRef}
        className="min-h-[calc(100vh-8rem)]"
        data-testid="scalar-root"
      />
      </div>
    </div>
  )
}
