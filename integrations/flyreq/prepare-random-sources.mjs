// Apply after prepare-workspace-ux.mjs to the pinned, integrated upstream source.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]);
async function patch(file, replacements) {
  const path = resolve(root, 'frontend/src', file);
  let text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
  for (const [before, after, count = 1] of replacements) {
    if (text.split(before).length !== count + 1) throw Error(`Unexpected source: ${file}: ${before}`);
    text = text.replaceAll(before, after);
  }
  await writeFile(path, text);
}
await patch('lib/constants.ts', [
  ['BA_RANDOM_URL', 'PHOTO_RANDOM_URL'],
  ['BING_WALLPAPER_URL', 'MONO_RANDOM_URL'],
  ['https://img.catcdn.cn/ba/', 'https://picsum.photos/1200/800'],
  ['https://bing.img.run/rand_uhd.php', 'https://picsum.photos/1200/800?grayscale'],
  ['Bing 每日壁纸', '随机黑白摄影'],
  ['BA 随机人物图片', '随机彩色摄影'],
]);
await patch('lib/i18n.ts', [
  ['toolbar.baPeople', 'toolbar.randomPhoto', 2],
  ['toolbar.bingWallpaper', 'toolbar.randomMono', 2],
  ["'BA People'", "'Color photography'"],
  ["'Bing Wallpaper'", "'Black-and-white photography'"],
  ["'BA人物'", "'彩色摄影'"],
  ["'Bing壁纸'", "'黑白摄影'"],
  ['settings.randomBaSource', 'settings.randomPhotoSource', 2],
  ['settings.randomBingSource', 'settings.randomMonoSource', 2],
  ['Random Image · BA People', 'Random Image · Color photography'],
  ['Random Image · Bing Wallpaper', 'Random Image · Black-and-white photography'],
  ['随机图片 · BA人物', '随机图片 · 彩色摄影'],
  ['随机图片 · Bing壁纸', '随机图片 · 黑白摄影'],
]);
await patch('components/SettingsModal.tsx', [
  ['BA_RANDOM_URL', 'PHOTO_RANDOM_URL', 2],
  ['BING_WALLPAPER_URL', 'MONO_RANDOM_URL', 2],
  ['settings.randomBaSource', 'settings.randomPhotoSource'],
  ['settings.randomBingSource', 'settings.randomMonoSource'],
  ['img.catcdn.cn', 'picsum.photos'],
  ['bing.img.run', 'picsum.photos'],
]);
for (const file of ['WorkspaceHeader.tsx', 'WorkspaceModeTabs.tsx']) {
  await patch('components/workspace/' + file, [
    ['BA_RANDOM_URL', 'PHOTO_RANDOM_URL', 2],
    ['BING_WALLPAPER_URL', 'MONO_RANDOM_URL', 2],
    ['toolbar.baPeople', 'toolbar.randomPhoto', 2],
    ['toolbar.bingWallpaper', 'toolbar.randomMono', 2],
  ]);
}
await patch('components/workspace/WorkspaceHeader.tsx', [
  ['function getDistance(', `// Each open/refresh gets a new request, including reopening the same category.
function randomImageUrl(url: string) {
  const next = new URL(url);
  next.searchParams.set('random', crypto.randomUUID());
  return next.toString();
}

function getDistance(`],
  ['setImageSrc(url);', 'setImageSrc(randomImageUrl(url));', 2],
  ["setImageSrc(`${imageApiUrl}${imageApiUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`);", 'setImageSrc(randomImageUrl(imageApiUrl));'],
]);
