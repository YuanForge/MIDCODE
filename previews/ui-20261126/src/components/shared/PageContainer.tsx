import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='page-container'
      className={cn(
        'mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-5 py-8 md:px-10 md:py-10',
        className,
      )}
      {...props}
    />
  )
}
