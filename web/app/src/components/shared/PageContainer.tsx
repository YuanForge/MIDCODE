import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        'mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 md:px-6 md:py-6',
        className,
      )}
      {...props}
    />
  )
}
