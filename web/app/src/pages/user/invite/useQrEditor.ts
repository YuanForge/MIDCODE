import { useState } from 'react'
import { toast } from 'sonner'

import { getApiErrorMessage } from '@/lib/api/http'
import { userApi } from '@/lib/api/user'

export type QrKind = 'wechat' | 'alipay'

const KIND_LABEL: Record<QrKind, string> = { wechat: '微信', alipay: '支付宝' }

/**
 * Payment QR codes. The saved values come from the server; an edit is kept as a draft that replaces
 * them, so nothing has to be copied into state by an effect once the data has loaded.
 */
export function useQrEditor({
  saved,
  run,
  onError,
}: {
  saved: { wechat: string; alipay: string }
  run: (fn: () => Promise<void>) => Promise<void>
  onError: (message: string) => void
}) {
  const [drafts, setDrafts] = useState<{ wechat: string | null; alipay: string | null }>({ wechat: null, alipay: null })
  const values = { wechat: drafts.wechat ?? saved.wechat, alipay: drafts.alipay ?? saved.alipay }

  function set(kind: QrKind, value: string) {
    setDrafts((current) => ({ ...current, [kind]: value }))
  }

  async function upload(kind: QrKind, file: File | undefined) {
    if (!file) return
    onError('')
    try {
      const response = await userApi.uploadImage(file, 'payment-qr')
      const url = response.url ?? ''
      if (!url) throw new Error('上传失败，未返回图片地址')
      set(kind, url)
      toast.success(`${KIND_LABEL[kind]}收款码上传成功`)
    } catch (err) {
      const message = getApiErrorMessage(err)
      onError(message)
      toast.error(message)
    }
  }

  async function save() {
    await run(async () => {
      await userApi.savePaymentQR({ wechat_qr: values.wechat, alipay_qr: values.alipay })
      toast.success('收款码已保存')
    })
  }

  return { values, set, upload, save }
}
