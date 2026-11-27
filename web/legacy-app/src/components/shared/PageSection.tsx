import type { ReactNode } from 'react'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? (
          <CardAction className="col-start-1 row-start-auto row-span-1 mt-2 justify-self-start sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:mt-0 sm:justify-self-end">
            {action}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  )
}
