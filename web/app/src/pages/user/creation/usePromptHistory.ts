import { useCallback, useEffect, useState } from 'react'

import type { CreationMode } from './constants'

const STORAGE_KEY = 'creation_prompt_history'
const MAX_ITEMS = 30

export type PromptHistoryEntry = {
  prompt: string
  mode: CreationMode
  at: number
}

function read(): PromptHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(entries: PromptHistoryEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // 忽略存储失败（隐私模式等）
  }
}

export function usePromptHistory() {
  const [entries, setEntries] = useState<PromptHistoryEntry[]>(() => read())

  useEffect(() => { write(entries) }, [entries])

  const add = useCallback((prompt: string, mode: CreationMode) => {
    const text = prompt.trim()
    if (!text) return
    setEntries((prev) => {
      const deduped = prev.filter((e) => e.prompt !== text)
      return [{ prompt: text, mode, at: Date.now() }, ...deduped].slice(0, MAX_ITEMS)
    })
  }, [])

  const remove = useCallback((prompt: string) => {
    setEntries((prev) => prev.filter((e) => e.prompt !== prompt))
  }, [])

  const clear = useCallback(() => setEntries([]), [])

  return { entries, add, remove, clear }
}
