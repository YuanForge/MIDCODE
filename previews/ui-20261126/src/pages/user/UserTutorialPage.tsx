import { BookOpenIcon } from 'lucide-react'

import { EmptyState } from '@/components/shared/EmptyState'
import { MarkdownDocument } from '@/components/shared/MarkdownDocument'
import { PageHeader } from '@/components/shared/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useSiteSettings } from '@/hooks/use-site-settings'

/** Tutorial: the site's own Markdown guide, read straight off the page with its heading outline. */
export function UserTutorialPage() {
  const { settings, loaded } = useSiteSettings()
  const markdown = settings.tutorialMarkdown.trim()

  return (
    <>
      <PageHeader title='新手教程' description='阅读站点管理员提供的使用说明与接入指南。' />
      {!loaded ? (
        <div aria-busy='true' className='flex w-full max-w-3xl flex-col gap-4'>
          <Skeleton className='h-6 w-64' />
          <Skeleton className='h-6 w-full' />
          <Skeleton className='h-6 w-11/12' />
          <Skeleton className='h-6 w-10/12' />
          <Skeleton className='h-40 w-full' />
        </div>
      ) : !markdown ? (
        <EmptyState
          icon={<BookOpenIcon />}
          title='暂未配置教程文档'
          description='请在后台系统设置中填写“新手教程 Markdown”内容。'
        />
      ) : (
        <div className='mx-auto w-full max-w-5xl'>
          <MarkdownDocument content={markdown} showHeadingNav panel />
        </div>
      )}
    </>
  )
}
