import { useLayoutEffect, type RefObject } from 'react'

/**
 * Keeps one highlight element under whichever option of a segmented control is selected, so the highlight
 * travels to the new choice instead of two options repainting.
 *
 * The list gets `data-indicator="ready"` only once a selected option has been measured. Until then, and
 * whenever nothing can be measured (no selection, or the list is not laid out), each option keeps its own
 * selected fill, so the control never shows without a selection.
 *
 * The first placement is not animated: the highlight appears in place, and travels only on later changes.
 */
export function useSlidingIndicator(
  listRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  /** Matches the selected option inside the list, for example `[data-state=active]` or `[aria-pressed=true]`. */
  selectedSelector: string,
  enabled = true,
) {
  useLayoutEffect(() => {
    const list = listRef.current
    const indicator = indicatorRef.current
    if (!enabled || !list || !indicator || typeof ResizeObserver === 'undefined') return

    let frame = 0

    const place = () => {
      const selected = list.querySelector<HTMLElement>(selectedSelector)
      if (!selected || selected.offsetWidth === 0 || selected.offsetParent !== list) {
        cancelAnimationFrame(frame)
        delete list.dataset.indicator
        delete indicator.dataset.animate
        return
      }
      indicator.style.width = `${selected.offsetWidth}px`
      indicator.style.height = `${selected.offsetHeight}px`
      indicator.style.translate = `${selected.offsetLeft}px ${selected.offsetTop}px`
      if (list.dataset.indicator !== 'ready') {
        list.dataset.indicator = 'ready'
        // Travel is switched on a frame later, so the highlight does not slide in from the corner.
        frame = requestAnimationFrame(() => {
          indicator.dataset.animate = 'true'
        })
      }
    }

    const sizes = new ResizeObserver(place)
    const watchSizes = () => {
      sizes.disconnect()
      sizes.observe(list)
      for (const child of Array.from(list.children)) {
        if (child !== indicator) sizes.observe(child)
      }
    }

    const changes = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList')) watchSizes()
      place()
    })

    watchSizes()
    changes.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'data-active', 'aria-current', 'aria-pressed', 'aria-selected', 'aria-checked'],
    })
    place()

    return () => {
      cancelAnimationFrame(frame)
      sizes.disconnect()
      changes.disconnect()
      delete list.dataset.indicator
      delete indicator.dataset.animate
    }
  }, [enabled, indicatorRef, listRef, selectedSelector])
}
