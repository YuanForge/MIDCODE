const imageBase64Signatures: Array<[string, string]> = [
  ['iVBORw0KGgo', 'image/png'],
  ['/9j/', 'image/jpeg'],
  ['R0lGOD', 'image/gif'],
  ['UklGR', 'image/webp'],
  ['PHN2Zy', 'image/svg+xml'],
  ['PD94bWw', 'image/svg+xml'],
]

function detectBase64ImageMime(value: string) {
  return imageBase64Signatures.find(([signature]) => value.startsWith(signature))?.[1] ?? 'image/png'
}

function isLikelyBase64Image(value: string) {
  if (value.length < 64 || value.length % 4 === 1) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
  return imageBase64Signatures.some(([signature]) => value.startsWith(signature))
}

export function normalizeImageSrc(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed
  }

  const compact = trimmed.replace(/\s/g, '')
  if (!isLikelyBase64Image(compact)) return trimmed
  return `data:${detectBase64ImageMime(compact)};base64,${compact}`
}

export function openImageUrl(url: string) {
  if (url.startsWith('data:')) {
    const [header, base64] = url.split(',')
    const mime = header.replace('data:', '').replace(';base64', '')
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: mime })
    const blobUrl = URL.createObjectURL(blob)
    const win = window.open(blobUrl, '_blank')
    if (win) win.addEventListener('unload', () => URL.revokeObjectURL(blobUrl))
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function collectImageSources(...values: unknown[]) {
  const sources: string[] = []

  const append = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string') {
          append(item)
        } else if (item && typeof item === 'object') {
          append((item as { url?: unknown }).url)
        }
      })
      return
    }

    const source = normalizeImageSrc(value)
    if (source) sources.push(source)
  }

  values.forEach(append)
  return Array.from(new Set(sources))
}

export function pickVideoUrl(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) return item.trim()
        if (item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string') {
          return ((item as { url?: string }).url ?? '').trim()
        }
      }
    }
    if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
      return ((value as { url?: string }).url ?? '').trim()
    }
  }
  return ''
}

export function splitLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function triggerDownload(url: string, filename?: string) {
  const a = document.createElement('a')
  a.href = url
  if (filename) a.download = filename
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
