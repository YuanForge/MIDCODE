import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

// Ledger buttons are capsules: every size is fully rounded, and an icon-only button is a circle.
// The brand fill is the one coloured action; everything else is a glass or ruled outline.
// Press feedback: the capsule shrinks a little in 70ms on press and eases back over 140ms on release.
// Menu triggers do not shrink, so the menu they anchor stays put (dialog triggers do: a dialog is not
// anchored to its button). `--press` is the pressed scale: text
// buttons use 0.97, icon circles 0.92 so the change is visible on a small target, and links stay at 1.
const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,box-shadow,scale,opacity] duration-140 ease-out [--press:0.97] motion-safe:active:not-aria-[haspopup=menu]:scale-(--press) active:duration-70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed aria-expanded:bg-primary-hover',
        brand:
          'bg-brand text-brand-foreground hover:bg-primary-hover active:bg-primary-pressed',
        outline:
          'border-glass-border bg-glass-strong text-foreground backdrop-blur-sm hover:border-input-hover hover:bg-card aria-expanded:border-input-hover aria-expanded:bg-card',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        ghost:
          'text-foreground hover:bg-muted aria-expanded:bg-muted',
        destructive:
          'border-destructive/35 bg-transparent text-destructive hover:bg-destructive/10 active:bg-destructive/15 focus-visible:border-destructive focus-visible:ring-destructive/20',
        link: 'text-brand underline-offset-4 hover:underline [--press:1]',
      },
      // A capsule needs a little more room at its ends than a square corner did, so labels clear the curve.
      size: {
        default:
          'h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5',
        xs: 'h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*=size-])]:size-3',
        sm: 'h-8 gap-1.5 px-3.5 text-[13px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*=size-])]:size-3.5',
        lg: 'h-10 gap-2 px-6 text-[15px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5',
        icon: 'size-9 [--press:0.92]',
        'icon-xs':
          'size-6 [--press:0.92] [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-8 [--press:0.92]',
        'icon-lg': 'size-10 [--press:0.92]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot='button'
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
