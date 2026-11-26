import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { useSlidingIndicator } from "@/hooks/use-sliding-indicator"
import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

// default: segmented control (filters, code languages). line: page-level sections.
// In the segmented control one ink capsule sits under the selected tab and travels to the next choice.
const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center text-muted-foreground group-data-horizontal/tabs:h-10 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "rounded-full border border-glass-border bg-glass p-1 backdrop-blur-md",
        line: "gap-5 rounded-none border-b border-glass-border bg-transparent p-0 group-data-horizontal/tabs:h-11",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.List>, "ref"> &
  VariantProps<typeof tabsListVariants>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const indicatorRef = React.useRef<HTMLSpanElement>(null)
  const segmented = variant === "default"
  useSlidingIndicator(listRef, indicatorRef, "[data-slot=tabs-trigger][data-state=active]", segmented)

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {segmented ? (
        <span
          ref={indicatorRef}
          aria-hidden
          data-slot="tabs-indicator"
          className="pointer-events-none absolute top-0 left-0 hidden rounded-full bg-foreground/90 shadow-sm ease-out group-data-[indicator=ready]/tabs-list:block data-[animate=true]:transition-[translate,width,height] data-[animate=true]:duration-200"
        />
      ) : null}
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-140 ease-out outline-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:data-active:bg-foreground/90 group-data-[variant=default]/tabs-list:data-active:text-background group-data-[variant=default]/tabs-list:data-active:hover:text-background group-data-[variant=default]/tabs-list:data-active:shadow-sm",
        // Once the travelling capsule is placed it carries the fill, and the selected tab keeps only its ink colour.
        "group-data-[variant=default]/tabs-list:group-data-[indicator=ready]/tabs-list:data-active:bg-transparent group-data-[variant=default]/tabs-list:group-data-[indicator=ready]/tabs-list:data-active:shadow-none",
        // line: an underline grows from the centre of the selected tab, explaining which section is active.
        "group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:px-0.5 group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "after:absolute after:bg-primary after:transition-transform after:duration-200 after:ease-out group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:-bottom-px group-data-horizontal/tabs:after:h-0.5 group-data-horizontal/tabs:after:scale-x-0 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-vertical/tabs:after:scale-y-0 group-data-[variant=default]/tabs-list:after:hidden group-data-[variant=line]/tabs-list:data-active:after:scale-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none data-[state=active]:animate-reveal", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
