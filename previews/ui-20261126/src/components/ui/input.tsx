import * as React from "react"

import { cn } from "@/lib/utils"

// One 1px field border a step stronger than panel borders; focus adds the ring, hover darkens the edge.
// Fields are soft rectangles (10px), so they sit beside the capsule buttons without reading as a second shape system.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-2xl border border-input bg-card/80 px-3 py-1.5 text-base text-foreground transition-[border-color,box-shadow,background-color] duration-140 ease-out outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 hover:border-input-hover focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
