import { BookOpenIcon } from 'lucide-react'

import { MarkdownDocument } from '@/components/shared/MarkdownDocument'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSiteSettings } from '@/hooks/use-site-settings'

export function UserTutorialPage() {
  const { settings, loaded } = useSiteSettings()
  const markdown = settings.tutorialMarkdown.trim()

  if (!loaded) {
    return (
      <>
        <PageHeader eyebrow="Guide" title="新手教程" description="阅读站点管理员提供的使用说明与接入指南。" />
        <Card>
          <CardContent className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-6">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-11/12" />
            <Skeleton className="h-6 w-10/12" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </>
    )
  }

  if (!markdown) {
    return (
      <>
        <PageHeader eyebrow="Guide" title="新手教程" description="阅读站点管理员提供的使用说明与接入指南。" />
        <Card>
          <EmptyState
            icon={<BookOpenIcon className="size-6 text-muted-foreground" />}
            title="暂未配置教程文档"
            description="请在后台系统设置中填写“新手教程 Markdown”内容。"
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader eyebrow="Guide" title="新手教程" description="阅读站点管理员提供的使用说明与接入指南。" />
      <Card className="overflow-hidden">
        <CardContent className="mx-auto w-full max-w-5xl py-6">
          <MarkdownDocument content={markdown} showHeadingNav />
        </CardContent>
      </Card>
    </>
  )
}
