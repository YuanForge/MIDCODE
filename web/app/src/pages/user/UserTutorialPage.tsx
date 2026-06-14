import { BookOpenIcon } from 'lucide-react'

import { MarkdownDocument } from '@/components/shared/MarkdownDocument'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { useSiteSettings } from '@/hooks/use-site-settings'

export function UserTutorialPage() {
  const { settings, loaded } = useSiteSettings()
  const markdown = settings.tutorialMarkdown.trim()

  if (!loaded) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-11/12" />
        <Skeleton className="h-6 w-10/12" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!markdown) {
    return (
      <EmptyState
        icon={<BookOpenIcon className="size-6 text-muted-foreground" />}
        title="暂未配置教程文档"
        description="请在后台系统设置中填写“新手教程 Markdown”内容。"
      />
    )
  }

  return <MarkdownDocument content={markdown} />
}
