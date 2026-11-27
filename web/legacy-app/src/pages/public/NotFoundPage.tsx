import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-5 py-16 sm:px-8">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="gap-3 px-6 pt-6 sm:px-8 sm:pt-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            404
          </p>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">页面不存在</h1>
          </CardTitle>
          <CardDescription className="leading-7">
            当前地址没有对应页面。你可以返回首页，或回到所属角色的控制台。
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end px-6 py-4 sm:px-8">
          <Button className="w-full sm:w-auto" asChild>
            <Link to="/">返回首页</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
