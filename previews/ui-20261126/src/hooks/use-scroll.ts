import { useEffect, useSyncExternalStore, type RefObject } from 'react'

function subscribeScroll(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

/** True once the page has scrolled past `offset` pixels. The header uses it to turn into glass. */
export function useScrolled(offset = 20) {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > offset,
    () => false,
  )
}

/** Writes the page scroll progress (0 to 1) to the `--sp` variable of the target, once per animation frame. */
export function useScrollProgress(target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const element = target.current
      if (!element) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      element.style.setProperty('--sp', max > 0 ? (window.scrollY / max).toFixed(4) : '0')
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [target])
}
