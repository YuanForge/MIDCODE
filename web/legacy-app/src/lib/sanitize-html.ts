const allowedTags = new Set([
  'a', 'b', 'br', 'code', 'div', 'em', 'i', 'img', 'li', 'ol', 'p', 'span', 'strong', 'u', 'ul',
])

const allowedAttrs = new Set(['alt', 'class', 'href', 'src', 'style', 'target', 'title'])

function isSafeUrl(value: string) {
  const trimmed = value.trim().toLowerCase()
  return trimmed === '' ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
}

export function sanitizeHtml(input: string) {
  if (!input || typeof window === 'undefined') {
    return ''
  }
  const doc = new DOMParser().parseFromString(input, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT)
  const remove: Element[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode as Element
    const tag = node.tagName.toLowerCase()
    if (!allowedTags.has(tag)) {
      remove.push(node)
      continue
    }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || !allowedAttrs.has(name)) {
        node.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
        node.removeAttribute(attr.name)
      }
      if (name === 'target' && attr.value === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }
  }

  for (const node of remove) {
    node.remove()
  }
  return doc.body.innerHTML
}
