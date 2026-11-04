import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || '');
const upstream = 'bcec8c8992b407997a5f872bcb7fa1436d7505cd';
if (!process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== upstream) {
  throw new Error(`请提供固定上游版本 ${upstream} 的独立源码目录。`);
}
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'frontend', 'backend'], { cwd: root, stdio: 'pipe' });
const configPath = process.argv[3] || fileURLToPath(new URL('./branding.env.example', import.meta.url));
const config = Object.fromEntries((await fs.readFile(configPath, 'utf8')).split(/\r?\n/)
  .filter(line => line && !line.startsWith('#')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
/** 读取环境优先的品牌值，校验源码替换字符；输入配置键，返回安全字符串。 */
function setting(key) {
  const value = process.env[key] || config[key];
  if (!value || /["'`\\\r\n<>]/.test(value)) throw new Error(`品牌配置无效：${key}`);
  return value;
}
const name = setting('MIDCODE_STUDIO_NAME');
const brand = setting('MIDCODE_STUDIO_BRAND');
const api = setting('MIDCODE_STUDIO_API_URL').replace(/\/$/, '');
const source = setting('MIDCODE_STUDIO_SOURCE_URL');
const guide = setting('MIDCODE_STUDIO_GUIDE_ZH');
for (const url of [api, source]) if (new URL(url).protocol !== 'https:') throw new Error('线上地址必须使用 HTTPS。');
const oldGuide = '默认已为你准备 FlyReq 的 GPT Image 2 图片模型，只需要前往 FlyReq 获取 API Key，填入后保存即可开始生成图片。1元=20张4k图。';
let count = 0;
/** 递归替换界面品牌文案；输入源码目录，无返回值，不修改存储键、协议路径和版权文件。 */
async function transform(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await transform(file); continue; }
    if (!/\.(tsx?|js|json)$/.test(file)) continue;
    const before = await fs.readFile(file, 'utf8');
    let after = before.replaceAll(oldGuide, guide).replaceAll('https://flyreq.com', api)
      .replaceAll('前往 flyreq.com', `前往 ${brand}`)
      .replaceAll('FlyReq Image Studio', name).replaceAll('FlyReq Image', name).replaceAll('FlyReq', brand);
    if (file.endsWith('SettingsModal.tsx')) {
      // 修改版源码入口与原始作者链接分别保留，便于追溯授权及重建版本。
      const marker = '<a href="https://github.com/doudou770/flyreq-image-studio"';
      after = after.replace(marker, `<a href="${source}" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">${brand} {t('settings.projectRepository')}</a>{' · '}<a href="https://github.com/doudou770/flyreq-image-studio"`);
    }
    if (after !== before) { await fs.writeFile(file, after); count++; }
  }
}
await transform(path.join(root, 'frontend/src'));
// 后端只替换服务器入口的品牌默认值，不修改依赖清单、协议标识或持久化数据结构。
const serverFile = path.join(root, 'backend/server.js');
let server = await fs.readFile(serverFile, 'utf8');
server = server.replaceAll(oldGuide, guide).replaceAll('https://flyreq.com', api)
  .replaceAll('前往 flyreq.com', `前往 ${brand}`).replaceAll('FlyReq Image', name).replaceAll('FlyReq', brand);
await fs.writeFile(serverFile, server);
const publicDir = path.join(root, 'frontend/public');
const manifestFile = path.join(publicDir, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
manifest.name = name;
manifest.short_name = brand;
manifest.description = `${name} · AI image and video workspace`;
// 上游截图包含旧品牌，构建后可使用本部署的真实截图补充。
delete manifest.screenshots;
await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const require = createRequire(path.join(root, 'frontend/package.json'));
const sharp = require('sharp');
const logoFile = process.env.MIDCODE_STUDIO_LOGO_PATH || fileURLToPath(new URL('./logo.svg', import.meta.url));
for (const [file, size] of [['favicon.png', 48], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
  await sharp(logoFile).resize(size, size).png().toFile(path.join(publicDir, file));
}
await fs.copyFile(path.join(root, 'LICENSE'), path.join(publicDir, 'LICENSE.txt'));
await fs.writeFile(path.join(root, 'MIDCODE-BUILD.json'), JSON.stringify({ upstream, name, api, source }, null, 2) + '\n');
console.log(JSON.stringify({ upstream, sourceFilesChanged: count, name, api }));
