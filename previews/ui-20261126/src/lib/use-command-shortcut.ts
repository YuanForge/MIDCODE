import { useEffect } from 'react'

/** Cmd+K on a Mac, Ctrl+K elsewhere. The handler runs on every press, so it should toggle. */
export function useCommandShortcut(onTrigger: () => void) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onTrigger()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onTrigger])
}
