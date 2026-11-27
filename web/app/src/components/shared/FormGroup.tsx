import type { ReactNode } from 'react'

/** A titled block of fields inside a dialog, set off from the next block by a rule. */
export function FormGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-3 border-t border-rule pt-4 first:border-t-0 first:pt-0'>
      <p className='text-sm font-medium'>{title}</p>
      <div className='grid gap-4 sm:grid-cols-2'>{children}</div>
    </div>
  )
}
