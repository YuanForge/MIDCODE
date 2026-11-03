import { createMediaStore, sha256, signedToken, readToken } from '../media-storage/store.mjs'

export function createImageMedia({ secret, store = createMediaStore(), publicOrigin = 'https://image.midcode.cc' }) {
  const sessionSecret = secret + ':image-upload-v1'
  const linkSecret = secret + ':image-read-v1'
  return {
    session(data) {
      if (!store || typeof data.apiKey !== 'string') return null
      // The identity is established only by the authenticated one-time handoff.
      const owner = sha256(data.apiKey)
      return `midcode_image=${signedToken({ owner, exp: Date.now() + 43200000 }, sessionSecret)}; Path=/midcode/media; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
    },
    async handle(req, res, pathname) {
      if (!pathname.startsWith('/midcode/media')) return false
      res.setHeader('Cache-Control', 'no-store')
      if (!store) { res.writeHead(503).end(); return true }
      if (pathname === '/midcode/media' && req.method === 'POST') {
        if (req.headers.origin !== publicOrigin) { res.writeHead(403).end(); return true }
        const cookie = req.headers.cookie?.match(/(?:^|;\s*)midcode_image=([^;]+)/)?.[1]
        const session = readToken(cookie, sessionSecret)
        if (!session || session.exp < Date.now() || !/^[a-f0-9]{64}$/.test(session.owner)) { res.writeHead(401).end(); return true }
        const type = req.headers['content-type']?.split(';')[0]
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(type)) { res.writeHead(415).end(); return true }
        const chunks = []; let size = 0
        for await (const chunk of req) { size += chunk.length; if (size > 40 * 1024 * 1024) { res.writeHead(413).end(); return true } chunks.push(chunk) }
        const bytes = Buffer.concat(chunks)
        if (!bytes.length) { res.writeHead(400).end(); return true }
        const key = `image/${session.owner}/${sha256(bytes)}`
        await store.put(key, bytes, type)
        const token = signedToken({ key }, linkSecret)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ url: `${publicOrigin}/midcode/media/${token}` }))
        return true
      }
      if (req.method === 'GET' && pathname.startsWith('/midcode/media/')) {
        const value = readToken(pathname.slice('/midcode/media/'.length), linkSecret)
        if (!value || !/^image\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(value.key)) { res.writeHead(403).end(); return true }
        res.writeHead(302, { Location: await store.url(value.key), 'Referrer-Policy': 'no-referrer' }).end()
        return true
      }
      res.writeHead(405).end(); return true
    },
  }
}
