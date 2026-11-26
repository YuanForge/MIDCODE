import type { AdminCard } from '@/lib/api/admin'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const CARD_PAGE_SIZE = 50

/** Card values arrive in millionths of a yuan. */
export function yuan(credits?: number, digits = 4) {
  return `¥${((credits ?? 0) / 1_000_000).toFixed(digits)}`
}

export function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

export function statusTone(status?: string): Tone {
  if (status === 'unused') return 'success'
  if (status === 'voided') return 'danger'
  return 'neutral'
}

export function statusLabel(status?: string) {
  if (status === 'unused') return '未使用'
  if (status === 'voided') return '已作废'
  return '已使用'
}

export type GenerateForm = { count: string; amount: string; note: string; vendorId: string }

export const initialGenerateForm: GenerateForm = { count: '10', amount: '10', note: '', vendorId: '' }

export type GeneratePayload = { count: number; credits: number; note: string; vendor_id: number | null }

export type BuiltGenerate = { payload: GeneratePayload } | { error: string }

/** Validate the form and build the request body, so the dialog can show the message where the person is looking. */
export function buildGeneratePayload(form: GenerateForm): BuiltGenerate {
  const count = Number(form.count)
  const amount = Number(form.amount)
  if (!Number.isInteger(count) || count < 1) return { error: '数量需要是大于 0 的整数' }
  if (!Number.isFinite(amount) || amount <= 0) return { error: '面值需要大于 0' }
  return {
    payload: {
      count,
      credits: Math.round(amount * 1_000_000),
      note: form.note,
      vendor_id: form.vendorId ? Number(form.vendorId) : null,
    },
  }
}

export function cardLine(card: AdminCard) {
  return `${card.code} ${(card.credits ?? 0) / 1_000_000}元`
}

export function buildUnusedCsv(cards: AdminCard[]) {
  const header = '兑换码,面值(元),批次号,备注,生成时间'
  const rows = cards.map((card) =>
    [card.code, ((card.credits ?? 0) / 1_000_000).toFixed(4), card.batch_id ?? '', card.note ?? '', card.created_at ? new Date(card.created_at).toLocaleString('zh-CN') : ''].join(','),
  )
  return [header, ...rows].join('\n')
}

export function downloadCsv(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
