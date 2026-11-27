import type { AdminOcpcPlatform } from '@/lib/api/admin'

export type PlatformForm = {
  id?: number
  platform: string
  name: string
  enabled: boolean
  baidu_token: string
  baidu_page_url: string
  baidu_reg_type: string
  baidu_order_type: string
  e360_key: string
  e360_secret: string
  e360_jzqs: string
  e360_so_type: string
  e360_reg_event: string
  e360_order_event: string
}

export const emptyForm: PlatformForm = {
  platform: 'baidu',
  name: '',
  enabled: true,
  baidu_token: '',
  baidu_page_url: '',
  baidu_reg_type: '68',
  baidu_order_type: '10',
  e360_key: '',
  e360_secret: '',
  e360_jzqs: '',
  e360_so_type: '1',
  e360_reg_event: '',
  e360_order_event: '',
}

export const INTERVALS = [
  { value: '10', label: '每 10 分钟' },
  { value: '15', label: '每 15 分钟' },
  { value: '30', label: '每 30 分钟' },
  { value: '60', label: '每 1 小时' },
  { value: '120', label: '每 2 小时' },
  { value: '360', label: '每 6 小时' },
]

export function formFromRow(row: AdminOcpcPlatform): PlatformForm {
  return {
    id: row.id,
    platform: row.platform ?? 'baidu',
    name: row.name ?? '',
    enabled: row.enabled ?? true,
    baidu_token: row.baidu_token ?? '',
    baidu_page_url: row.baidu_page_url ?? '',
    baidu_reg_type: String(row.baidu_reg_type ?? 68),
    baidu_order_type: String(row.baidu_order_type ?? 10),
    e360_key: row.e360_key ?? '',
    e360_secret: row.e360_secret ?? '',
    e360_jzqs: row.e360_jzqs ?? '',
    e360_so_type: row.e360_so_type ?? '1',
    e360_reg_event: row.e360_reg_event ?? '',
    e360_order_event: row.e360_order_event ?? '',
  }
}

/** The conversion types are picked as text in the form and sent as numbers. */
export function toPayload(form: PlatformForm) {
  return {
    ...form,
    baidu_reg_type: Number(form.baidu_reg_type),
    baidu_order_type: Number(form.baidu_order_type),
  }
}

export function platformLabel(platform?: string) {
  if (platform === 'baidu') return '百度'
  if (platform === '360') return '360'
  return platform ?? '-'
}

/** The one setting that tells accounts apart at a glance: the landing page for Baidu, the key for 360. */
export function keyConfig(row: AdminOcpcPlatform) {
  return row.baidu_page_url || row.e360_key || '-'
}
