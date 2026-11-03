import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Transform } from 'node:stream'

export const sha256 = value => createHash('sha256').update(value).digest('hex')
export function signedToken(value, secret) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url')
}
export function readToken(token, secret) {
  if (typeof token !== 'string' || token.length > 2048) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { return null }
}
export function createMediaStore(env = process.env) {
  if (!env.MEDIA_S3_ENDPOINT) return null
  const endpoint = new URL(env.MEDIA_S3_ENDPOINT)
  if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || endpoint.username || endpoint.password) throw new Error('Invalid media endpoint')
  const bucket = env.MEDIA_S3_BUCKET || 'midcode-media'
  const client = new S3Client({ endpoint: endpoint.href, region: 'us-east-1', forcePathStyle: true,
    credentials: { accessKeyId: env.MEDIA_S3_ACCESS_KEY, secretAccessKey: env.MEDIA_S3_SECRET_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 3 })
  const safe = key => { if (!/^(image|video|verification)\/[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error('Invalid media key'); return key }
  return {
    async put(key, bytes, type) { await client.send(new PutObjectCommand({ Bucket: bucket, Key: safe(key), Body: bytes, ContentType: type, CacheControl: 'private, max-age=300' })) },
    async putStream(key, stream, type, limit = 512 * 1024 * 1024) {
      let size = 0
      const bounded = new Transform({ transform(chunk, _, cb) { size += chunk.length; cb(size > limit ? new Error('Media exceeds storage limit') : null, chunk) } })
      stream.on('error', error => bounded.destroy(error)); stream.pipe(bounded)
      const upload = new Upload({ client, params: { Bucket: bucket, Key: safe(key), Body: bounded, ContentType: type, CacheControl: 'private, max-age=300' }, queueSize: 2, partSize: 5 * 1024 * 1024, leavePartsOnError: false })
      try { await upload.done() } finally { stream.destroy(); bounded.destroy() }
    },
    async exists(key) { try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: safe(key) })); return true } catch (e) { if (e.$metadata?.httpStatusCode === 404) return false; throw e } },
    async url(key, seconds = 900) { return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: safe(key) }), { expiresIn: seconds }) },
  }
}
