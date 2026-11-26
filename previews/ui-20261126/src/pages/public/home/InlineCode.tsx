import type { ReactNode } from 'react'

/** Sets the odd parts of a backtick-split string as inline code, so translations can mark code without markup. */
export function InlineCode({ text }: { text: string }): ReactNode {
  return text.split('`').map((part, index) =>
    index % 2 ? (
      <code key={index} className='rounded-md bg-glass-strong px-1.5 py-px font-mono text-[12.5px] text-foreground [overflow-wrap:anywhere]'>
        {part}
      </code>
    ) : (
      part
    ),
  )
}
