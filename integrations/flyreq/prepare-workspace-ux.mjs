import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]);
async function replace(file, before, after) {
  const path = resolve(root, file), text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
  if (text.split(before).length !== 2) throw Error(`Unexpected source: ${file}`);
  await writeFile(path, text.replace(before, after));
}
await replace('frontend/src/components/workspace/WorkspaceHeader.tsx',
  "import { Button, buttonVariants }", "import { createPortal } from 'react-dom';\nimport { Button, buttonVariants }");
await replace('frontend/src/components/workspace/WorkspaceHeader.tsx',
  '{viewerOpen && (\n        <RandomImageViewer', '{viewerOpen && createPortal(\n        <RandomImageViewer');
await replace('frontend/src/components/workspace/WorkspaceHeader.tsx',
  'canRefresh={!!imageApiUrl}\n        />\n      )}', 'canRefresh={!!imageApiUrl}\n        />, document.body\n      )}');
await replace('frontend/src/components/workspace/WorkspaceModeTabs.tsx',
  '<TabsList className="mt-4', `<a href="/dashboard" aria-label="返回 MIDCODE 工作台" title="返回 MIDCODE 工作台" className="mt-3 flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><span aria-hidden="true">←</span><span className={labelsHidden}>返回 MIDCODE 工作台</span></a>\n\n        <TabsList className="mt-4`);

await replace('frontend/src/components/workspace/WorkspaceHeader.tsx',
  '  const instanceId = useId();', `  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => { setFailed(true); onImageError(); }, 15000);
    return () => window.clearTimeout(timer);
  }, [src, loading, onImageError]);
  const instanceId = useId();`);
await replace('frontend/src/components/workspace/WorkspaceHeader.tsx',
  '          onLoad={onImageLoaded}\n          onError={onImageError}',
  '          onLoad={() => { setFailed(false); onImageLoaded(); }}\n          onError={() => { setFailed(true); onImageError(); }}');
await replace('frontend/src/components/workspace/WorkspaceHeader.tsx',
  '        {loading && (', `        {failed && <div role="alert" className="absolute inset-0 flex items-center justify-center p-8 text-center text-muted-foreground">图片来源暂时无法连接，请点击右上角“换一张”重试。</div>}
        {loading && (`);
