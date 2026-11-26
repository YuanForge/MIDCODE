import { useEffect } from 'react'

const ROW = '[data-row]'
const OVERLAYS = '[role=dialog], [role=alertdialog], [role=menu], [role=listbox]'

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * List keys for the console. j and k move between rows and Enter opens the focused one.
 * A row opts in with data-row and names its open control with data-row-open.
 * The keys are left alone while typing, while any dialog or menu is open, and when a modifier is held.
 */
export function useRowKeys() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target) || document.querySelector(OVERLAYS)) return
      const rows = Array.from(document.querySelectorAll<HTMLElement>(ROW))
      if (rows.length === 0) return
      const active = document.activeElement
      const current = active instanceof HTMLElement ? active.closest<HTMLElement>(ROW) : null
      const index = current ? rows.indexOf(current) : -1

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault()
        const next = rows[event.key === 'j' ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0)]
        if (!next.hasAttribute('tabindex')) next.tabIndex = -1
        next.focus()
        next.scrollIntoView({ block: 'nearest' })
      } else if (event.key === 'Enter' && current && active === current) {
        const open = current.querySelector<HTMLElement>('[data-row-open]')
        if (open) {
          event.preventDefault()
          open.click()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
