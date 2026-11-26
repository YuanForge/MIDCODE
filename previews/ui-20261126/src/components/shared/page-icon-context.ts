import { createContext, type ComponentType } from 'react'

/** The icon of the page that is open, taken from its navigation entry, so the page heading can repeat it. */
export const PageIconContext = createContext<ComponentType<{ className?: string }> | null>(null)
