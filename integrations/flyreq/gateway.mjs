import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createMediaStore, readToken } from '../media-storage/store.mjs';

export const prefix = '/studio-preview';
const fail = (status, message) => Object.assign(new Error(message), { status });
/** 从可信交接模型构建无真实密钥的前端注册表；输入用户配置，返回统一模型列表。 */
export function registry(profiles) {
  const r = { schemaVersion: 2, imageModels: [], videoModels: [], textModels: [], defaults: {} };
  for (const p of profiles) for (const m of p.models) {
    const common = { id: `midcode-${p.keyId}-${m.id}`, protocol: 'openai', name: `${p.name} · ${m.id}`, modelId: m.id, usesPresetModelId: false, apiKey: `midcode-${p.keyId}`, baseUrl: 'https://midcode.cc' };
    if (m.type === 'image' || /^(gpt-image-|grok-imagine-image)/.test(m.id)) r.imageModels.push({ ...common, builtinPreset: m.id.startsWith('grok-imagine') ? 'grok-imagine-image' : 'gpt-image-2', maxRefImages: 16, maxOutputSize: '4K', supportsAdvancedParams: true, supportsTemperature: false, streamImages: false });
    else if (m.type === 'video') r.videoModels.push(common);
    else if (m.type === 'llm') r.textModels.push(common);
  }
  for (const key of ['textToImage', 'imageToImage']) r.defaults[key] = r.imageModels[0]?.id || '';
  r.defaults.videoGeneration = r.videoModels[0]?.id || '';
  for (const key of ['reversePrompt', 'agent', 'promptOptimize', 'imageDescribe']) r.defaults[key] = r.textModels[0]?.id || '';
  return r;
}
/** 启动候选网关；输入部署环境，返回 HTTP server。 */
export async function createGateway(env = process.env) {
  const secret = env.TOONFLOW_HANDOFF_SECRET;
  if (!secret || secret.length < 32 || !env.MIDCODE_BACKEND || !env.MIDCODE_PUBLIC_ORIGIN) throw new Error('Missing gateway configuration');
  const publicOrigin = new URL(env.MIDCODE_PUBLIC_ORIGIN).origin;
  const backend = new URL(env.MIDCODE_BACKEND).origin;
  const root = resolve(env.FLYREQ_ROOT || '/app');
  const state = resolve(env.MIDCODE_STATE || '/state');
  const port = Number(env.PORT || 8195);
  const mediaSecret = createHmac('sha256', secret).update('unified-media-v1').digest('hex');
  const media = createMediaStore(env);
  await mkdir(state, { recursive: true, mode: 0o700 });
  const accounts = JSON.parse(await readFile(resolve(state, 'accounts.json'), 'utf8').catch(() => '{}'));
  const tenants = new Map(), authCache = new Map();
  let persistQueue = Promise.resolve(), nextPort = Number(env.MIDCODE_TENANT_PORT_BASE || 19000);
  const boot = await readFile(new URL('./boot.js', import.meta.url), 'utf8');
  /** 序列化保存密钥配置；无输入，返回持久化 Promise。 */
  function persist() {
    const data = JSON.stringify(accounts);
    persistQueue = persistQueue.catch(() => {}).then(async () => {
      await writeFile(resolve(state, 'accounts.new'), data, { mode: 0o600 });
      await rename(resolve(state, 'accounts.new'), resolve(state, 'accounts.json'));
    });
    return persistQueue;
  }
  /** 取得代理覆盖的真实地址；输入请求，返回 IP。 */
  function clientIP(req) {
    const ip = env.MIDCODE_TRUST_PROXY === '1' ? String(req.headers['x-midcode-client-ip'] || '') : req.socket.remoteAddress?.replace(/^::ffff:/, '');
    if (!isIP(ip)) throw fail(403, 'Invalid client address');
    return ip;
  }
  /** 调用现有身份校验接口；输入动作、凭证、IP，返回可信身份数据。 */
  async function auth(action, token, ip) {
    const response = await fetch(`${backend}/api/public/video-studio/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Toonflow-Handoff-Secret': secret, 'X-Forwarded-For': ip, 'X-Midcode-Client-IP': ip }, body: JSON.stringify({ token }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fail([401,403].includes(response.status) ? response.status : 503, 'Please enter from MIDCODE again');
    return response.json();
  }
  /** 验证会话并确定唯一租户；输入请求，返回 UID。 */
  async function authorize(req) {
    const token = req.headers.cookie?.match(/(?:^|;\s*)midcode_unified=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!token) throw fail(401, 'Please sign in to MIDCODE');
    const ip = clientIP(req), key = token + ':' + ip;
    let value = authCache.get(key);
    if (!value || value.until < Date.now()) {
      const session = await auth('session', token, ip);
      value = { uid: String(session.userId), until: Date.now() + 15000 };
      authCache.set(key, value);
    }
    if (!accounts[value.uid]) throw fail(401, 'Please enter from MIDCODE again');
    return value.uid;
  }
  /** 生成只供租户后端使用的鉴权码；输入 UID 和密钥 ID，返回 HMAC。 */
  const capability = (uid, kid) => createHmac('sha256', secret).update(`unified:${uid}:${kid}`).digest('hex');
  /** 启动独立任务进程；输入 UID，返回可用的 loopback 端口。 */
  async function tenant(uid) {
    if (tenants.has(uid)) return tenants.get(uid).ready;
    if (tenants.size >= Number(env.MIDCODE_MAX_TENANTS || 8)) throw fail(503, 'Candidate workspace capacity reached');
    const entry = { port: nextPort++ };
    entry.ready = (async () => {
      const dir = resolve(state, uid); await mkdir(dir, { recursive: true, mode: 0o700 });
      const childEnv = { ...env, NODE_ENV: 'production', PORT: String(entry.port), HOSTNAME: '127.0.0.1', FLYREQ_TASK_DB: resolve(dir, 'tasks.sqlite'), FLYREQ_IMAGE_DIR: resolve(dir, 'images'), FLYREQ_VIDEO_DIR: resolve(dir, 'videos'), MIDCODE_USER_ID: uid, MIDCODE_GATEWAY: `http://127.0.0.1:${port}`, MIDCODE_PREFIX: prefix, MIDCODE_MEDIA_SECRET: mediaSecret, MIDCODE_TENANT_FILE: resolve(dir, 'profiles.json'), FLYREQ_PLATFORM_LOGO_URL: prefix+'/favicon.png', FLYREQ_PLATFORM_ICON_URL: prefix+'/favicon.png', FLYREQ_PWA_ICON_192_URL: prefix+'/icon-192.png', FLYREQ_PWA_ICON_512_URL: prefix+'/icon-512.png', FLYREQ_PWA_MASKABLE_ICON_512_URL: prefix+'/icon-maskable-512.png', FLYREQ_IMAGE_UPSTREAM_LOG_ENABLED: 'false', FLYREQ_VIDEO_UPSTREAM_LOG_ENABLED: 'false' };
      delete childEnv.TOONFLOW_HANDOFF_SECRET;
      entry.child = spawn(process.execPath, [resolve(root, 'backend/server.js')], { cwd: dir, env: childEnv, stdio: ['ignore', 'ignore', 'ignore'] });
      entry.child.once('exit', () => tenants.delete(uid));
      entry.child.once('error', () => tenants.delete(uid));
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(`http://127.0.0.1:${entry.port}/api/flyreq/config`, { signal: AbortSignal.timeout(500) }); if (r.ok) return entry.port; } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw fail(503, 'Workspace is starting');
    })();
    tenants.set(uid, entry);
    return entry.ready;
  }
  /** 有界读取请求；输入请求和字节上限，返回 Buffer。 */
  async function body(req, limit = 4096) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail(413, 'Request too large'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  /** 写入不缓存的 JSON 响应；输入状态、内容，结束响应。 */
  function json(res, status, value, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(value));
  }
  const login = `<!doctype html><meta charset="utf-8"><title>MIDCODE Studio</title><p id="status">正在连接 MIDCODE / Connecting to MIDCODE…</p><script>
  (async()=>{let code=new URLSearchParams(location.hash.slice(1)).get('midcode_code');history.replaceState(null,'',location.pathname);if(!code){const token=localStorage.getItem('token');if(!token)throw Error('请先登录 MIDCODE / Please sign in to MIDCODE');const r=await fetch('/api/user/video-studio/handoff',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error('请先登录用户账户 / Please sign in with a user account');code=new URLSearchParams(new URL((await r.json()).url).hash.slice(1)).get('midcode_code');}const r=await fetch('${prefix}/midcode/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});if(!r.ok)throw Error('无法连接工作台，请重试 / Unable to connect');location.replace('${prefix}/zh/');})().catch(e=>document.getElementById('status').textContent=e.message);</script><a href="/login">MIDCODE 登录 / Sign in</a>`;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, publicOrigin);
      if (url.pathname === '/health') return json(res, 200, { status: 'ok', tenants: tenants.size });
      const internal = url.pathname.match(/^\/_upstream\/(\d+)\/(\d+)(\/v1\/(?:models|responses|images\/(?:generations|edits)|image|video|tasks\/\d+))$/);
      if (internal) {
        if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw fail(403, 'Forbidden');
        const [, uid, kid, route] = internal, expected = capability(uid, kid), actual = (req.headers.authorization || '').replace(/^Bearer /,'');
        if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw fail(403, 'Forbidden');
        const profile = accounts[uid]?.profiles.find(p => String(p.keyId) === kid);
        if (!profile) throw fail(403, 'Forbidden');
        const apiRoute = ['/v1/video','/v1/image'].includes(route) || route.startsWith('/v1/tasks/') ? '/api' + route : route;
        const result = await fetch(backend + apiRoute + url.search, { method: req.method, headers: { Authorization: `Bearer ${profile.apiKey}`, ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}) }, ...(req.method === 'POST' ? { body: req, duplex: 'half' } : {}), redirect: 'error', signal: AbortSignal.timeout(1800000) });
        res.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
        if (result.body) await pipeline(Readable.fromWeb(result.body), res); else res.end();
        return;
      }
      if (!url.pathname.startsWith(prefix + '/') && url.pathname !== prefix) throw fail(404, 'Not found');
      const route = url.pathname.slice(prefix.length) || '/';
      if (route === '/entry' && req.method === 'GET') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(login); return; }
      if (!['GET','HEAD'].includes(req.method) && req.headers.origin !== publicOrigin) throw fail(403, 'Origin mismatch');
      if (route === '/midcode/exchange' && req.method === 'POST') {
        const input = JSON.parse((await body(req)).toString());
        if (!/^[a-f0-9]{64}$/.test(input.code)) throw fail(400, 'Invalid handoff');
        const data = await auth('redeem', input.code, clientIP(req)), uid = String(data.userId);
        if (!/^\d+$/.test(uid) || !Array.isArray(data.profiles)) throw fail(502, 'Invalid handoff response');
        accounts[uid] = { profiles: data.profiles }; await persist();
        const dir = resolve(state, uid); await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeFile(resolve(dir, 'profiles.json'), JSON.stringify(data.profiles.map(p => ({ keyId: p.keyId, models: p.models, capability: capability(uid, p.keyId) }))), { mode: 0o600 });
        await tenant(uid);
        return json(res, 200, { userId: Number(uid) }, { 'Set-Cookie': `midcode_unified=${data.session}; Path=${prefix}; HttpOnly; SameSite=Strict; Max-Age=43200${publicOrigin.startsWith('https:') ? '; Secure' : ''}` });
      }
      if (route.startsWith('/media/') && req.method === 'GET') {
        const value = readToken(route.slice(7), mediaSecret);
        if (!value || !/^(image|video)\/unified\/\d+\/[a-f0-9]{64}$/.test(value.key)) throw fail(403, 'Invalid media link');
        if (!media) throw fail(503, 'Media unavailable');
        res.writeHead(302, { Location: await media.url(value.key), 'Cache-Control': 'no-store' }).end(); return;
      }
      let uid;
      try { uid = await authorize(req); } catch (e) {
        if (['/','/zh/','/en/','/entry'].includes(route) && req.method === 'GET' && [401,403].includes(e.status)) { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(login); return; }
        throw e;
      }
      if (route === '/midcode/session') return json(res,200,{userId:Number(uid),registry:registry(accounts[uid].profiles)});
      const targetPort = await tenant(uid);
      // 禁止浏览器 GET 参数携带密钥或访问任意模型代理地址。
      if (route === '/api/flyreq/proxy/models' && req.method !== 'POST') throw fail(405, 'Use POST');
      if (/^\/api\/flyreq\/video-tasks\/[^/]+\/cancel$/.test(route)) throw fail(409, '任务已交给 MIDCODE，请等待完成 / This task is running in MIDCODE; please wait for completion');
      if (route.startsWith('/api/') && !/^\/api\/flyreq\/(?:config|queue-status|prompts|blacklist|manifest\.webmanifest|proxy\/(?:text|models)|tasks(?:\/batch|\/[^/]+(?:\/ack)?)?|video-tasks(?:\/[^/]+(?:\/(?:ack|cancel))?)?)$/.test(route)) throw fail(404, 'Not found');
      let target = route;
      const result = await fetch(`http://127.0.0.1:${targetPort}${target}${url.search}`, { method: req.method, headers: { ...(req.headers['content-type'] ? {'Content-Type':req.headers['content-type']} : {}) }, ...(!['GET','HEAD'].includes(req.method) ? { body:req, duplex:'half' } : {}), redirect:'manual' });
      const type = result.headers.get('content-type') || 'application/octet-stream';
      res.writeHead(result.status, { 'Content-Type':type, 'Cache-Control':'no-store' });
      if (type.includes('text/html')) {
        const config = JSON.stringify({userId:Number(uid),prefix,registry:registry(accounts[uid].profiles)}).replaceAll('<','\\u003c');
        res.end((await result.text()).replace('<head>', `<head><script>window.__MIDCODE_STUDIO__=${config};${boot}</script>`));
      } else if(result.body) await pipeline(Readable.fromWeb(result.body),res); else res.end();
    } catch(e) { if (!res.headersSent) json(res,e.status||502,{error:e.status?e.message:'Workspace temporarily unavailable'}); else res.end(); }
  });
  server.on('upgrade', async (req, socket, head) => {
    try {
      if (req.url !== prefix+'/api/flyreq/ws' || req.headers.origin !== publicOrigin) throw fail(403,'Forbidden');
      const uid = await authorize(req), targetPort = await tenant(uid);
      const upstream = http.request({ host:'127.0.0.1',port:targetPort,path:'/api/flyreq/ws',headers:{...req.headers,host:`127.0.0.1:${targetPort}`}});
      upstream.on('upgrade',(response,peer,data)=>{
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
        if(head.length)peer.write(head);if(data.length)socket.write(data);peer.pipe(socket);socket.pipe(peer);
        const timer=setInterval(()=>authorize(req).catch(()=>socket.destroy()),30000);timer.unref();
        socket.on('close',()=>{clearInterval(timer);peer.destroy()});peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());
      });upstream.on('error',()=>socket.destroy());upstream.end();
    } catch {socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
  });
  server.on('close',()=>{for(const t of tenants.values())t.child?.kill();});
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')) {
  const server = await createGateway(); server.listen(Number(process.env.PORT||8195), process.env.HOST||'127.0.0.1');
}
