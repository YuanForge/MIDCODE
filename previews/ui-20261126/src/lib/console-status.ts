import { useEffect, useRef, useSyncExternalStore } from 'react'

type Reading = { rows: number | null; ms: number | null }

const empty: Reading = { rows: null, ms: null }
let reading: Reading = empty
const listeners = new Set<() => void>()

function publish(next: Reading) {
  reading = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** What the status bar shows: the size of the list on screen and how long it took to load. */
export function useReading() {
  return useSyncExternalStore(subscribe, () => reading, () => empty)
}

/** A list page calls this with its row count and loading flag. The reading clears when the page goes away. */
export function useReportRows(rows: number, loading: boolean) {
  const started = useRef<number | null>(null)

  useEffect(() => {
    if (loading) {
      started.current = performance.now()
      return
    }
    const ms = started.current == null ? null : Math.round(performance.now() - started.current)
    publish({ rows, ms })
  }, [rows, loading])

  useEffect(() => () => publish(empty), [])
}

/** The modifier the command palette answers to on this machine. */
export function modKeyLabel() {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'
}
