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
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-5 py-16 sm:px-8">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="gap-3 px-6 pt-6 sm:px-8 sm:pt-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Application error
          </p>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
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
