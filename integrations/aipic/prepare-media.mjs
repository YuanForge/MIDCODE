import { readFile, writeFile, copyFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
export async function prepareMedia(source) {
  const here = dirname(fileURLToPath(import.meta.url))
  await copyFile(resolve(here, 'cloud-media.ts'), resolve(source, 'src/lib/cloud-media.ts'))
  const db = resolve(source, 'src/lib/db.ts')
  let text = await readFile(db, 'utf8')
  const marker = '    await putImage({\n      id,\n      dataUrl,'
  if (!text.includes(marker)) throw new Error('Unsupported image storage source')
  text = "import { storeCloudImage } from './cloud-media'\n" + text.replace(marker, '    const cloudUrl = await storeCloudImage(dataUrl)\n    await putImage({\n      id,\n      dataUrl: cloudUrl,')
  await writeFile(db, text)
  const store = resolve(source, 'src/store.ts')
  text = await readFile(store, 'utf8')
  const signature = 'function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {'
  if (!text.includes(signature)) throw new Error('Unsupported image export source')
  text = text.replace(signature, `async function dataUrlToBytes(dataUrl: string): Promise<{ ext: string; bytes: Uint8Array }> {
  if (/^https:\\/\\//.test(dataUrl)) {
    const response = await fetch(dataUrl)
    if (!response.ok) throw new Error('图片下载失败')
    const blob = await response.blob()
    return { ext: blob.type.split('/')[1] || 'png', bytes: new Uint8Array(await blob.arrayBuffer()) }
  }`)
  text = text.replace('= dataUrlToBytes(img.dataUrl)', '= await dataUrlToBytes(img.dataUrl)').replace('= dataUrlToBytes(thumbnail.thumbnailDataUrl)', '= await dataUrlToBytes(thumbnail.thumbnailDataUrl)')
  text = text.replace(/cacheImage\(imgId, (dataUrl|image\.dataUrl)\)/g, 'cacheImage(imgId, (await getImage(imgId))?.dataUrl || $1)')
  await writeFile(store, text)
  // Images redirected to S3 must retain a clean canvas for masks and exports.
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = resolve(folder, entry.name)
      if (entry.isDirectory()) { await walk(file); continue }
      if (!/\.tsx?$/.test(file)) continue
      let source = await readFile(file, 'utf8')
      source = source.replace(/(const\s+(\w+)\s*=\s*new Image\(\))/g, '$1\n    $2.crossOrigin = "anonymous"')
      await writeFile(file, source)
    }
  }
  await walk(resolve(source, 'src'))
}
