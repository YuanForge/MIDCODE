import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'divider' }

type HeadingAnchor = {
  id: string
  level: number
  text: string
}

type MarkdownDocumentProps = {
  content: string
  showHeadingNav?: boolean
}

function isTableSeparator(line: string) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)
}

function isDivider(line: string) {
  return /^(\s*---+\s*|\s*\*\*\*+\s*)$/.test(line)
}

function isHeading(line: string) {
  return /^(#{1,6})\s+/.test(line.trim())
}

function isBlockquote(line: string) {
  return /^\s*>\s?/.test(line)
}

function isOrderedList(line: string) {
  return /^\s*\d+\.\s+/.test(line)
}

function isUnorderedList(line: string) {
  return /^\s*[-*+]\s+/.test(line)
}

function isCodeFence(line: string) {
  return /^\s*```/.test(line)
}

function splitTableRow(line: string) {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map((cell) => cell.trim())
}

function isTableStart(lines: string[], index: number) {
  return index + 1 < lines.length && lines[index].includes('|') && isTableSeparator(lines[index + 1])
}

function isSpecialBlockStart(lines: string[], index: number) {
  const line = lines[index]
  return (
    isCodeFence(line) ||
    isHeading(line) ||
    isBlockquote(line) ||
    isOrderedList(line) ||
    isUnorderedList(line) ||
    isDivider(line) ||
    isTableStart(lines, index)
  )
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue

    if (isCodeFence(line)) {
      const language = trimmed.slice(3).trim()
      const content: string[] = []
      i += 1
      while (i < lines.length && !isCodeFence(lines[i])) {
        content.push(lines[i])
        i += 1
      }
      blocks.push({ type: 'code', language, code: content.join('\n') })
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      })
      continue
    }

    if (isTableStart(lines, i)) {
      const headers = splitTableRow(lines[i])
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      i -= 1
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (isBlockquote(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && isBlockquote(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      i -= 1
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n').trim() })
      continue
    }

    if (isOrderedList(line) || isUnorderedList(line)) {
      const ordered = isOrderedList(line)
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i]
        const listMatch = ordered
          ? current.match(/^\s*\d+\.\s+(.*)$/)
          : current.match(/^\s*[-*+]\s+(.*)$/)

        if (listMatch) {
          items.push(listMatch[1].trim())
          i += 1
          continue
        }

        if (current.trim() && /^\s{2,}\S/.test(current) && items.length > 0) {
          items[items.length - 1] += `\n${current.trim()}`
          i += 1
          continue
        }

        break
      }
      i -= 1
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    if (isDivider(line)) {
      blocks.push({ type: 'divider' })
      continue
    }

    const paragraphLines: string[] = []
    while (i < lines.length && lines[i].trim() && !isSpecialBlockStart(lines, i)) {
      paragraphLines.push(lines[i].trim())
      i += 1
    }
    i -= 1
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') })
  }

  return blocks
}

function renderInlineTokens(text: string, keyPrefix: string) {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+)/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${match.index}`}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em]"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${match.index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            {linkMatch[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    } else {
      nodes.push(
        <a
          key={`${keyPrefix}-url-${match.index}`}
          href={token}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-4"
        >
          {token}
        </a>,
      )
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function renderInline(text: string, keyPrefix: string) {
  return text.split('\n').map((line, index) => (
    <Fragment key={`${keyPrefix}-${index}`}>
      {index > 0 ? <br /> : null}
      {renderInlineTokens(line, `${keyPrefix}-${index}`)}
    </Fragment>
  ))
}

function headingSlug(text: string, index: number) {
  const base = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)

  return base || `section-${index + 1}`
}

function buildHeadingAnchors(blocks: MarkdownBlock[]) {
  const used = new Map<string, number>()
  const headingIds = new Map<number, string>()
  const headings: HeadingAnchor[] = []

  blocks.forEach((block, index) => {
    if (block.type !== 'heading') return

    const slug = headingSlug(block.text, index)
    const count = used.get(slug) ?? 0
    used.set(slug, count + 1)

    const id = count === 0 ? `tutorial-${slug}` : `tutorial-${slug}-${count + 1}`
    headingIds.set(index, id)
    headings.push({ id, level: block.level, text: block.text })
  })

  return { headingIds, headings }
}

function updateHash(id: string) {
  const hash = encodeURIComponent(id)
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`)
}

export function MarkdownDocument({ content, showHeadingNav = false }: MarkdownDocumentProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content])
  const { headingIds, headings } = useMemo(() => buildHeadingAnchors(blocks), [blocks])
  const [activeHeading, setActiveHeading] = useState('')
  const canShowHeadingNav = showHeadingNav && headings.length > 1

  useEffect(() => {
    if (!canShowHeadingNav) return undefined

    const firstHeading = headings[0]?.id ?? ''
    setActiveHeading((current) => (current && headings.some((heading) => heading.id === current) ? current : firstHeading))

    const hash = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : ''
    if (hash && headings.some((heading) => heading.id === hash)) {
      window.requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ block: 'start' })
      })
    }

    if (!('IntersectionObserver' in window)) {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible[0]?.target.id) {
          setActiveHeading(visible[0].target.id)
        }
      },
      { rootMargin: '-96px 0px -65% 0px', threshold: [0, 1] },
    )

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [canShowHeadingNav, headings])

  function scrollToHeading(id: string) {
    const element = document.getElementById(id)
    if (!element) return
    setActiveHeading(id)
    updateHash(id)
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function renderHeadingNav() {
    if (!canShowHeadingNav) return null

    return (
      <aside className="order-first lg:order-none lg:sticky lg:top-6 lg:self-start">
        <nav className="rounded-lg border bg-card/80 p-3 text-sm shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">标题定位</p>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => scrollToHeading(headings[0].id)}
            >
              回到顶部
            </button>
          </div>
          <div className="max-h-[calc(100vh-9rem)] space-y-1 overflow-auto pr-1">
            {headings.map((heading) => (
              <button
                key={heading.id}
                type="button"
                className={cn(
                  'block w-full rounded-md px-2 py-1.5 text-left text-xs leading-5 transition hover:bg-muted',
                  heading.level > 2 && 'pl-4',
                  heading.level > 3 && 'pl-6',
                  activeHeading === heading.id
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground',
                )}
                onClick={() => scrollToHeading(heading.id)}
              >
                {heading.text}
              </button>
            ))}
          </div>
        </nav>
      </aside>
    )
  }

  return (
    <div className={cn('mx-auto w-full max-w-5xl', canShowHeadingNav && 'grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_240px]')}>
      <article className="min-w-0 space-y-6">
        {blocks.map((block, index) => {
          if (block.type === 'heading') {
            const sizeClass =
              block.level === 1
                ? 'text-3xl font-semibold'
                : block.level === 2
                  ? 'text-2xl font-semibold'
                  : block.level === 3
                    ? 'text-xl font-semibold'
                    : 'text-lg font-semibold'
            const headingId = headingIds.get(index)
            const headingClassName = `${sizeClass} scroll-mt-24 text-foreground`

            if (block.level === 1) {
              return <h1 key={index} id={headingId} className={headingClassName}>{renderInline(block.text, `heading-${index}`)}</h1>
            }
            if (block.level === 2) {
              return <h2 key={index} id={headingId} className={headingClassName}>{renderInline(block.text, `heading-${index}`)}</h2>
            }
            if (block.level === 3) {
              return <h3 key={index} id={headingId} className={headingClassName}>{renderInline(block.text, `heading-${index}`)}</h3>
            }
            if (block.level === 4) {
              return <h4 key={index} id={headingId} className={headingClassName}>{renderInline(block.text, `heading-${index}`)}</h4>
            }
            if (block.level === 5) {
              return <h5 key={index} id={headingId} className={headingClassName}>{renderInline(block.text, `heading-${index}`)}</h5>
            }
            return <h6 key={index} id={headingId} className={headingClassName}>{renderInline(block.text, `heading-${index}`)}</h6>
          }

          if (block.type === 'paragraph') {
            return (
              <p key={index} className="text-[15px] leading-7 text-foreground/90">
                {renderInline(block.text, `paragraph-${index}`)}
              </p>
            )
          }

          if (block.type === 'blockquote') {
            return (
              <blockquote
                key={index}
                className="border-l-4 border-primary/25 bg-muted/30 px-4 py-3 text-[15px] leading-7 text-muted-foreground"
              >
                {renderInline(block.text, `blockquote-${index}`)}
              </blockquote>
            )
          }

          if (block.type === 'code') {
            return (
              <div key={index} className="overflow-hidden rounded-xl border bg-zinc-950">
                {block.language ? (
                  <div className="border-b border-zinc-800 px-4 py-2 text-xs font-medium uppercase text-zinc-400">
                    {block.language}
                  </div>
                ) : null}
                <pre className="overflow-x-auto p-4 text-sm leading-6 text-zinc-100">
                  <code>{block.code}</code>
                </pre>
              </div>
            )
          }

          if (block.type === 'list') {
            const ListTag = block.ordered ? 'ol' : 'ul'
            return (
              <ListTag
                key={index}
                className={block.ordered ? 'list-decimal space-y-2 pl-6 text-[15px] leading-7' : 'list-disc space-y-2 pl-6 text-[15px] leading-7'}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="text-foreground/90">
                    {renderInline(item, `list-${index}-${itemIndex}`)}
                  </li>
                ))}
              </ListTag>
            )
          }

          if (block.type === 'table') {
            return (
              <div key={index} className="overflow-x-auto rounded-xl border">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th
                          key={headerIndex}
                          className="border-b px-4 py-3 text-left font-semibold text-foreground"
                        >
                          {renderInline(header, `table-head-${index}-${headerIndex}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b last:border-b-0">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-4 py-3 align-top text-foreground/90">
                            {renderInline(cell, `table-cell-${index}-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          return <hr key={index} className="border-border" />
        })}
      </article>
      {renderHeadingNav()}
    </div>
  )
}
