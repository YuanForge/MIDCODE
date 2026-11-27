import { useEffect, useState } from 'react'

/** Id of the last section whose top edge has passed 45% of the viewport height, or null above the first one. */
export function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let current: string | null = null
      for (const id of ids) {
        const element = document.getElementById(id)
        if (element && element.getBoundingClientRect().top < window.innerHeight * 0.45) current = id
      }
      setActive(current)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ids])

  return active
}
