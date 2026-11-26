import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <main className="console-canvas flex min-h-svh items-center justify-center px-5 py-16 sm:px-8">
      <Card className="w-full max-w-lg py-0 animate-page-enter">
        <CardHeader className="gap-2 px-6 pt-7 sm:px-8 sm:pt-8">
          <p className="text-[clamp(3.5rem,9vw,5.5rem)] leading-none font-extrabold tracking-tight text-brand tabular-nums">404</p>
          <CardTitle>
            <h1 className="text-2xl leading-8 font-extrabold tracking-[-0.01em]">页面不存在</h1>
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
