import { useEffect, useRef, useState } from 'react'

/**
 * Reports whether the referenced element is on screen. With `once` (the default) it stays true after the first
 * time, which suits entrances; without it the value follows the viewport, which suits demos that should pause
 * when scrolled away.
 */
export function useInView<T extends Element>({ threshold = 0.12, once = true }: { threshold?: number; once?: boolean } = {}) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, once])

  return [ref, inView] as const
}
