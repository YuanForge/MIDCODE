import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Chips are full pills, like the status pills of the home page; the leading dot keeps state from relying on colour.
// `default` is the filled ink chip for emphasis; record states use success / warning / destructive.
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-140 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary-hover",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        brand: "bg-accent text-accent-foreground",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        success: "bg-success/10 text-success dark:bg-success/15",
        warning: "bg-warning/10 text-warning dark:bg-warning/15",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-brand underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

/** Status chip with a leading dot, so state is never communicated by colour alone. */
function StatusBadge({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone?: "success" | "warning" | "danger" | "info" | "neutral"
}) {
  const variant =
    tone === "success" ? "success"
      : tone === "warning" ? "warning"
        : tone === "danger" ? "destructive"
          : tone === "info" ? "brand"
            : "secondary"
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn(badgeVariants({ variant }), "gap-1.5 pl-1.5", className)}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full bg-current",
          tone === "neutral" && "bg-muted-foreground/70",
        )}
      />
      {children}
    </span>
  )
}

export { Badge, StatusBadge, badgeVariants }
