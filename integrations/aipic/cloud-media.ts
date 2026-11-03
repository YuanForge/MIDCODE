// Keep a stable application URL in history. The server renews the short-lived
// private S3 URL on every read; old base64 history remains fully readable.
export async function storeCloudImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const response = await fetch('/midcode/media', { method: 'POST', body: blob,
      headers: { 'Content-Type': blob.type }, credentials: 'same-origin', signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error('upload')
    const { url } = await response.json()
    if (typeof url !== 'string' || !url.startsWith(`${location.origin}/midcode/media/`)) throw new Error('url')
    return url
  } catch {
    // Never discard a paid generation or existing history on a storage failure.
    window.dispatchEvent(new CustomEvent('midcode-storage-fallback'))
    return dataUrl
  }
}

let notified = false
window.addEventListener('midcode-storage-fallback', () => {
  if (notified) return
  notified = true
  const notice = document.createElement('div')
  notice.setAttribute('role', 'status')
  notice.textContent = '图片已保存在当前浏览器；云端保存暂未完成。请从 MIDCODE 重新进入后重试。'
  Object.assign(notice.style, { position: 'fixed', bottom: '24px', left: '24px', right: '24px', zIndex: '9999', padding: '12px', background: '#fff4d8', color: '#573c00', borderRadius: '8px' })
  notice.onclick = () => notice.remove()
  document.body.appendChild(notice)
})
