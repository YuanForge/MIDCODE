import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function AppErrorPage() {
  const error = useRouteError()

  let title = '页面暂时不可用'
  let description = '系统遇到了意外错误，请稍后重试。'

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText || '请求失败'}`
    description =
      typeof error.data === 'string'
        ? error.data
        : '当前路由在加载时发生错误。'
  } else if (error instanceof Error) {
    description = error.message
  }

  return (
    <main className="console-canvas flex min-h-svh items-center justify-center px-5 py-16 sm:px-8">
      <Card className="w-full max-w-lg py-0 animate-page-enter">
        <CardHeader className="gap-2 px-6 pt-7 sm:px-8 sm:pt-8">
          <CardTitle>
            <h1 className="text-2xl leading-8 font-extrabold tracking-[-0.01em]">{title}</h1>
          </CardTitle>
          <CardDescription className="leading-7">{description}</CardDescription>
        </CardHeader>
        <CardFooter className="flex-col-reverse gap-3 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
          <Button className="w-full sm:w-auto" asChild variant="outline">
            <Link to="/">返回首页</Link>
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => window.location.reload()}>
            刷新重试
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
