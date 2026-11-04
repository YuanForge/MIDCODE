import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
/** 以唯一源码锚点应用适配，输入文件、原文、替换文本；不匹配时拒绝静默生成。 */
async function replace(file, before, after) {
  const target = path.join(root, file), source = (await fs.readFile(target, 'utf8')).replace(/\r\n/g, '\n');
  if (!source.includes(before)) throw new Error(`缺少适配锚点：${file}: ${before}`);
  await fs.writeFile(target, source.replace(before, after));
}
await fs.copyFile(new URL('./tenant.cjs', import.meta.url), path.join(root, 'backend/midcode-tenant.cjs'));
await replace('backend/server.js', "const http = require('http');", "const http = require('http');\nconst midcode = require('./midcode-tenant.cjs');");
await replace('backend/server.js', 'resolve(raw ? JSON.parse(raw) : {});', "const parsed = raw ? JSON.parse(raw) : {};\n        resolve(parsed.apiKey ? midcode.lock(parsed) : parsed);");
await replace('backend/server.js', 'const { fields, files } = await readVideoMultipartBody(req);', 'const { fields, files } = await readVideoMultipartBody(req);\n      midcode.lock(fields);');
await replace('backend/server.js', 'function saveImageToDisk(taskId,', 'async function saveImageToDisk(taskId,');
await replace('backend/server.js', 'return { filePath, httpUrl: `/api/flyreq/images/${taskId}/${itemIndex}/${subIndex}` };', 'return { filePath, httpUrl: await midcode.archive(filePath, mimeType || "image/png") };');
await replace('backend/server.js', 'const result = saveImageToDisk(taskId,', 'const result = await saveImageToDisk(taskId,');
await replace('backend/server.js', 'return `/api/flyreq/videos/${taskId}`;', 'return await midcode.archive(filePath, response.headers.get("content-type") || "video/mp4");');
await replace('backend/server.js', 'async function createUpstreamVideo(apiKey, request, files, signal, trace) {', 'async function createUpstreamVideo(apiKey, request, files, signal, trace) {\n  return midcode.createVideo(apiKey, request, files, signal);');
await replace('backend/server.js', 'async function pollUpstreamVideo(apiKey, request, upstreamTaskId, signal, trace) {', 'async function pollUpstreamVideo(apiKey, request, upstreamTaskId, signal, trace) {\n  return midcode.pollVideo(apiKey, request, upstreamTaskId, signal);');
await replace('backend/server.js', 'async function generateFlyreqImage(apiKey, request, options = {}) {', 'async function generateFlyreqImage(apiKey, request, options = {}) {\n  if (midcode.isAsyncImage(apiKey, request.model)) return midcode.generateImage(apiKey, request);');
// 每个租户进程只接受网关内部请求；它不直接监听公网。
await replace('frontend/next.config.ts', 'const nextConfig: NextConfig = {', "const nextConfig: NextConfig = {\n  basePath: process.env.MIDCODE_PREFIX || '/studio-preview',");
await replace('frontend/next.config.ts', 'disable: dev,', 'disable: true,');
await replace('frontend/src/app/layout.tsx', "manifest: '/api/flyreq/manifest.webmanifest',", "manifest: '/studio-preview/api/flyreq/manifest.webmanifest',");
await replace('frontend/src/lib/i18n.ts', "pathname.split('/').filter(Boolean)[0]", "pathname.replace(/^\\/studio-preview(?=\\/|$)/, '').split('/').filter(Boolean)[0]");
await replace('frontend/src/lib/i18n.ts', "const parts = pathname.split('/').filter(Boolean);", "const parts = pathname.replace(/^\\/studio-preview(?=\\/|$)/, '').split('/').filter(Boolean);");
await replace('frontend/src/lib/i18n.ts', "return `/${parts.join('/')}/`;", "return `/studio-preview/${parts.join('/')}/`;");
await replace('frontend/src/app/layout.tsx', "window.location.pathname.split('/').filter(Boolean)", "window.location.pathname.split('/').filter(Boolean).filter(part => part !== 'studio-preview')");
for (const file of ['frontend/src/app/layout.tsx', 'frontend/src/components/BrandProvider.tsx']) {
  const full = path.join(root, file), source = await fs.readFile(full, 'utf8');
  await fs.writeFile(full, source.replaceAll("'/favicon.png'", "'/studio-preview/favicon.png'").replaceAll("'/icon-192.png'", "'/studio-preview/icon-192.png'").replaceAll("'/icon-512.png'", "'/studio-preview/icon-512.png'"));
}
console.log('MIDCODE integration prepared');
