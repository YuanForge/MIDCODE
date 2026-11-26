import { ImageStudioLaunch } from '@/components/shared/ImageStudioLaunch'
import { PageHeader } from '@/components/shared/PageHeader'

export function UserCreationPage() {
  return (
    <>
      <PageHeader title='创作中心' description='前往图片工作台，开始生成与修图。' />
      <ImageStudioLaunch />
    </>
  )
}
