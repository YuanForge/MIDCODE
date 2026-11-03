import {createMediaStore,sha256} from '../media-storage/store.mjs';
import http from 'node:http';
import https from 'node:https';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {lookup} from 'node:dns';
import {BlockList,isIP} from 'node:net';

const origin='https://image.midcode.cc';
const secret=process.env.TOONFLOW_HANDOFF_SECRET;
const backend=process.env.MIDCODE_BACKEND;
if(!secret||secret.length<32||!backend)throw new Error('Missing gateway configuration');
const gatewayName=process.env.GATEWAY_CONTAINER||'midcode-video-gateway';
const tenantImage=process.env.TENANT_IMAGE||'midcode-toonflow:tenant20261101';
const statePath='/state/accounts.json';
mkdirSync('/state',{recursive:true,mode:0o700});
const accounts=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
const bridge=readFileSync(new URL('./browserBridge.js',import.meta.url));
const providerTemplate=readFileSync(new URL('./mediaProvider.ts',import.meta.url),'utf8');
const mediaStore=createMediaStore();
const sharedRoot=process.env.VIDEO_DATA_ROOT;
if(!sharedRoot||!sharedRoot.startsWith('/mnt/fanapi-shared/'))throw new Error('Shared project storage required');
const pending=new Map();const validated=new Map();const activity=new Map();
const maxActive=Number(process.env.MAX_ACTIVE_TENANTS||4);
let allocation=Promise.resolve();
const modelBusy=new Map();
const now=()=>Date.now();
const persist=()=>{writeFileSync(statePath+'.new',JSON.stringify(accounts),{mode:0o600});renameSync(statePath+'.new',statePath)};
const capability=(uid,keyId)=>createHmac('sha256',secret).update(`model:${uid}:${keyId}`).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const failure=(status,message)=>Object.assign(new Error(message),{status});
const reply=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body))};
async function body(req,limit=8192){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw failure(413,'请求过大');chunks.push(chunk)}return Buffer.concat(chunks)}
async function jsonBody(req){try{return JSON.parse(await body(req))}catch(e){if(e.status)throw e;throw failure(400,'请求格式无效')}}
function docker(method,path,data){return new Promise((resolve,reject)=>{
 const req=http.request({socketPath:'/var/run/docker.sock',path:'/v1.45'+path,method,headers:{'Content-Type':'application/json'}},res=>{
  const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const raw=Buffer.concat(chunks).toString();let value;try{value=raw?JSON.parse(raw):{}}catch{value={}}
   if(res.statusCode>=400)reject(failure(res.statusCode,'运行环境操作失败'));else resolve(value)});
 });req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('Docker timeout')));req.end(data===undefined?undefined:JSON.stringify(data));
})}
async function inspect(uid){try{return await docker('GET',`/containers/midcode-video-user-${uid}/json`)}catch(e){if(e.status===404)return null;throw e}}
async function provision(uid){
 if(pending.has(uid))return pending.get(uid);
 const operation=allocation.catch(()=>{}).then(async()=>{
  const account=accounts[uid];if(!account)throw failure(401,'请从 MIDCODE 重新进入');
  let container=await inspect(uid);
  if(container?.State.Running){activity.set(uid,now());return container}
  const active=await docker('GET','/containers/json?filters='+encodeURIComponent(JSON.stringify({label:['midcode.video.tenant=true']})));
  if(active.length>=maxActive){
   const idle=active.find(c=>{
    const owner=c.Labels['midcode.video.owner'];
    if(!activity.has(owner)){activity.set(owner,now());return false}
    return now()-activity.get(owner)>15*60*1000 && !modelBusy.get(owner);
   });
   if(!idle)throw failure(503,'视频工作台当前繁忙，请稍后重试；已有项目已保存');
   await docker('POST',`/containers/${idle.Id}/stop?t=30`);
  }
  const network=`midcode-video-user-${uid}`;
  mkdirSync(`${sharedRoot}/${uid}`,{recursive:true,mode:0o700});
  const {chownSync}=await import('node:fs');chownSync(`${sharedRoot}/${uid}`,1000,1000);
  if(!container){
   try{await docker('POST','/networks/create',{Name:network,Internal:true,CheckDuplicate:true,Labels:{'midcode.video.tenant':'true'}})}catch(e){if(e.status!==409)throw e}
   try{await docker('POST',`/networks/${network}/connect`,{Container:gatewayName,EndpointConfig:{Aliases:['midcode-video-gateway']}})}catch(e){if(e.status!==403&&e.status!==409)throw e}
   await docker('POST','/volumes/create',{Name:`midcode-video-shared-user-${uid}`,Driver:'local',DriverOpts:{type:'none',o:'bind',device:`${sharedRoot}/${uid}`},Labels:{'midcode.video.tenant':'true'}});
   const seed={profiles:account.profiles.map(p=>({...p,apiKey:undefined,capability:capability(uid,p.keyId)}))};
   await docker('POST',`/containers/create?name=${network}`,{
    Image:tenantImage,User:'1000:1000',Env:[`TOONFLOW_PUBLIC_BASE=/video/u/${uid}`,`MIDCODE_TENANT_CONFIG=${JSON.stringify(seed)}`],
    Labels:{'midcode.video.tenant':'true','midcode.video.owner':String(uid)},
    HostConfig:{NetworkMode:network,CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Memory:640*1024*1024,NanoCpus:1000000000,PidsLimit:128,ReadonlyRootfs:true,Tmpfs:{'/tmp':'rw,nosuid,nodev,size=128m,uid=1000,gid=1000'},Mounts:[{Type:'volume',Source:`midcode-video-shared-user-${uid}`,Target:'/app/data'}],LogConfig:{Type:'json-file',Config:{'max-size':'5m','max-file':'2'}}},
    NetworkingConfig:{EndpointsConfig:{[network]:{}}},
   });
  }
  await docker('POST',`/containers/${network}/start`);
  container=await inspect(uid);activity.set(uid,now());
  const address=container.NetworkSettings.Networks[network].IPAddress;
  for(let attempt=0;attempt<80;attempt++){
   try{const response=await fetch(`http://${address}:3000/`,{signal:AbortSignal.timeout(1500)});if(response.ok)return container}catch{}
   await new Promise(r=>setTimeout(r,500));
  }
  throw failure(503,'工作台启动中，请稍后重试');
 });allocation=operation;pending.set(uid,operation);try{return await operation}finally{pending.delete(uid)}
}
function clientIP(req){
 // Nginx replaces this header using its trusted real-IP configuration.
 const value=String(req.headers['x-midcode-client-ip']||'');
 if(!isIP(value))throw failure(403,'网络来源无效');return value;
}
async function mainAuth(path,token,ip){
 const response=await fetch(backend+'/api/public/video-studio/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Toonflow-Handoff-Secret':secret,'X-Forwarded-For':ip,'X-Midcode-Client-IP':ip},body:JSON.stringify({token}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw failure(response.status===403?403:response.status===401?401:503,'登录已失效或当前网络不允许使用工作台，请从 MIDCODE 重新进入');
 return response.json();
}
async function authorize(req,uid){
 const token=req.headers.cookie?.match(/(?:^|;\s*)midcode_video=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)throw failure(401,'请先登录 MIDCODE');
 const ip=clientIP(req),key=token+':'+ip;
 let entry=validated.get(key);
 if(!entry||entry.until<now()){
  const session=await mainAuth('session',token,ip);
  entry={uid:String(session.userId),until:now()+15000};validated.set(key,entry);
 }
 if(uid&&entry.uid!==uid)throw failure(403,'当前账号与工作台不一致，请重新进入');
 return entry.uid;
}
async function syncTenant(uid,container){
 const address=container.NetworkSettings.Networks[`midcode-video-user-${uid}`].IPAddress;
 async function call(path,method='GET',data){
  const response=await fetch(`http://${address}:3000/api/${path}`,{method,headers:{Origin:`http://${address}:3000`,'x-toonflow-workspace':'1','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw failure(502,'同步模型配置失败，请重新进入');
  const result=await response.json();if(result.code!==200)throw failure(502,'同步模型配置失败，请重新进入');return result.data;
 }
 const installed=await call('providers/media/list');
 const custom=[],configs={};
 for(const profile of accounts[uid].profiles){
  const id=`midcodeKey${profile.keyId}`,apiKey=capability(uid,profile.keyId);
  const models=profile.models.filter(m=>['image','video'].includes(m.type)).map(m=>({id:m.id,label:m.id,type:m.type,...(m.type==='video'?{mode:['text','startFrameOptional']}: {})}));
  const source=providerTemplate.replace("id: 'midcodeTemplate'",`id: ${JSON.stringify(id)}`).replace("label: 'MIDCODE'",`label: ${JSON.stringify(profile.name)}`).replace('models: []',`models: ${JSON.stringify(models)}`);
  const existing=installed.find(p=>p.id===id);
  if(existing)await call('providers/media/save','PUT',{fileName:id+'.ts',source,revision:existing.revision});
  else await call('providers/media/add','POST',{source});
  configs[id]={apiKey};
  custom.push({id,label:profile.name,apiUrl:'http://midcode-video-gateway:8080/model/v1',apiKey,protocol:'openai-completions',models:profile.models.filter(m=>m.type==='llm').map(m=>({id:m.id,label:m.id}))});
 }
 const settings=await call('settings/get');
 settings.customProviders=[...(settings.customProviders||[]).filter(p=>!/^midcodeKey\d+$/.test(p.id)),...custom];
 settings.mediaProviderConfigs={...Object.fromEntries(Object.entries(settings.mediaProviderConfigs||{}).filter(([id])=>!/^midcodeKey\d+$/.test(id))),...configs};
 await call('settings/save','PUT',{settings});
}
function modelOwner(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(token))throw failure(403,'无效授权');
 for(const [uid,account] of Object.entries(accounts))for(const profile of account.profiles)if(same(token,capability(uid,profile.keyId)))return {uid,profile};
 throw failure(403,'授权已失效');
}
const denied=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]])denied.addSubnet(ip,bits,'ipv4');
for(const [ip,bits]of[['::',128],['::1',128],['::ffff:0:0',96],['fc00::',7],['fe80::',10],['ff00::',8]])denied.addSubnet(ip,bits,'ipv6');
function publicLookup(host,options,callback){lookup(host,{all:true},(error,addresses)=>{
 if(error)return callback(error);
 if(!addresses.length||addresses.some(a=>denied.check(a.address,a.family===6?'ipv6':'ipv4')))return callback(new Error('Private asset destination blocked'));
 if(options.all)return callback(null,addresses);callback(null,addresses[0].address,addresses[0].family);
})}
async function asset(url,res,redirects=0){
 const target=new URL(url);
 if(!['https:','http:'].includes(target.protocol)||target.username||target.password||redirects>4)throw failure(502,'素材地址不可用');
 // Reject numeric literals too: Node skips lookup for those.
 if(isIP(target.hostname.replace(/[\[\]]/g,''))&&denied.check(target.hostname.replace(/[\[\]]/g,''),target.hostname.includes(':')?'ipv6':'ipv4'))throw failure(502,'素材地址不可用');
 return new Promise((resolve,reject)=>{
  const request=(target.protocol==='https:'?https:http).get(target,{lookup:publicLookup},up=>{
   if([301,302,303,307,308].includes(up.statusCode)){up.resume();asset(new URL(up.headers.location,target).href,res,redirects+1).then(resolve,reject);return}
   if(up.statusCode!==200){up.resume();reject(failure(502,'素材下载失败'));return}
   res.writeHead(200,{'Content-Type':up.headers['content-type']||'application/octet-stream','Cache-Control':'no-store'});
   let bytes=0;up.on('data',chunk=>{bytes+=chunk.length;if(bytes>512*1024*1024)up.destroy(new Error('Asset too large'))});
   up.on('error',reject);up.on('end',resolve);up.pipe(res);
  });request.on('error',reject);request.setTimeout(120000,()=>request.destroy(new Error('Asset timeout')));
 });
}
function proxy(req,res,target,headers,mediaOwner){return new Promise((resolve,reject)=>{
 const archive=mediaStore&&mediaOwner&&req.method==='GET'&&new URL(target).pathname.startsWith('/api/');
 if(archive){headers={...headers};for(const k of ['range','if-range','if-none-match','if-modified-since'])delete headers[k];}

 const destination=new URL(target);
 const request=(destination.protocol==='https:'?https:http).request(destination,{method:req.method,headers},up=>{
  void (async()=>{
  const type=String(up.headers['content-type']||'').split(';')[0];
  if(archive&&up.statusCode===200&&/^(image\/(png|jpeg|webp|gif|avif)|video\/|audio\/)/.test(type)){
   const stamp=up.headers.etag||up.headers['last-modified'];
   const key=`video/${mediaOwner}/${sha256(target.replace(new URL(target).origin,'')+':'+(stamp||randomBytes(16).toString('hex'))+':'+(up.headers['content-length']||''))}`;
   if(stamp&&await mediaStore.exists(key))up.resume();
   else await mediaStore.putStream(key,up,type);
   res.writeHead(302,{'Location':await mediaStore.url(key),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();resolve();return;
  }
  const clean={...up.headers};for(const k of ['set-cookie','access-control-allow-origin','connection','transfer-encoding'])delete clean[k];
  clean['Cache-Control']='no-store';clean['X-Content-Type-Options']='nosniff';
  res.writeHead(up.statusCode,clean);up.pipe(res);up.on('end',resolve);up.on('error',reject);
  })().catch(error=>{up.destroy();reject(error)});
 });request.on('error',reject);request.setTimeout(1800000,()=>request.destroy(new Error('Proxy timeout')));
 res.on('close',()=>{request.destroy();resolve()});req.pipe(request);
})}
const landing=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MIDCODE 视频工作台</title><style>body{font:16px system-ui;background:#f5f7fa;color:#172337;display:grid;place-items:center;min-height:90vh}main{background:white;padding:40px;border-radius:16px;max-width:440px}a{color:#087e78}button{background:#087e78;color:white;border:0;border-radius:8px;padding:12px}</style><main><h1>视频工作台</h1><p id="status">从文字和图片开始创作视频，项目自动保存到你的账号。</p><a href="https://midcode.cc/video-studio">登录并进入工作台 →</a></main><script>const token=new URLSearchParams(location.hash.slice(1)).get('midcode_code');history.replaceState(null,'',location.pathname);if(token){document.querySelector('#status').textContent='正在准备你的工作台…';fetch('/video/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);location.replace(d.url)}).catch(e=>document.querySelector('#status').textContent=e.message)}</script></html>`;

const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),path=url.pathname;
  const rawPath=req.url.split('?')[0];
  if(rawPath.includes('\\')||/%2f|%5c|%00/i.test(rawPath))throw failure(400,'地址无效');
  if(path==='/health'){reply(res,200,{status:'ok'});return}
  if(path.startsWith('/model/')||path.startsWith('/media/')){
   const {uid,profile}=modelOwner(req);activity.set(uid,now());
   const apiPath=path.slice('/model'.length);
   if(path.startsWith('/media/')){
    if(req.method!=='GET'||!/^\/media\/\d+$/.test(path))throw failure(404,'不存在');
    const response=await fetch(backend+'/api/v1/tasks/'+path.split('/').pop(),{headers:{Authorization:`Bearer ${profile.apiKey}`},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw failure(response.status,'任务不可用');
    const task=await response.json();if(task.status!==2||!task.url)throw failure(409,'素材尚未完成');
    await asset(task.url,res);return;
   }
   const permitted=(req.method==='POST'&&['/v1/chat/completions','/v1/responses','/v1/image','/v1/video'].includes(apiPath))||(req.method==='GET'&&/^\/v1\/tasks\/\d+$/.test(apiPath));
   if(!permitted||url.search)throw failure(404,'接口不可用');
   modelBusy.set(uid,(modelBusy.get(uid)||0)+1);
   try{await proxy(req,res,backend+'/api'+apiPath,{'Content-Type':req.headers['content-type']||'application/json',Authorization:`Bearer ${profile.apiKey}`,...(req.headers['content-length']?{'Content-Length':req.headers['content-length']}:{})})}
   finally{modelBusy.set(uid,modelBusy.get(uid)-1);activity.set(uid,now())}return;
  }
  if(path==='/video/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(landing);return}
  if(path==='/video/exchange'&&req.method==='POST'){
   if(req.headers.origin!==origin)throw failure(403,'请求来源无效');
   const input=await jsonBody(req);const data=await mainAuth('redeem',input.token,clientIP(req));
   const uid=String(data.userId);if(!/^[1-9]\d*$/.test(uid)||!Array.isArray(data.profiles))throw failure(502,'账号数据无效');
   accounts[uid]={profiles:data.profiles};persist();
   const container=await provision(uid);await syncTenant(uid,container);
   reply(res,200,{url:`/video/u/${uid}/`},{'Set-Cookie':`midcode_video=${data.session}; Path=/video/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`});return;
  }
  const match=path.match(/^\/video\/u\/([1-9]\d*)\/(.*)$/);
  if(!match)throw failure(404,'页面不存在');
  const uid=match[1],inner='/'+match[2];await authorize(req,uid);
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)throw failure(403,'请求来源无效');
  if(inner==='/midcodeBridge.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(bridge);return}
  const container=await provision(uid),network=`midcode-video-user-${uid}`;
  const address=container.NetworkSettings.Networks[network].IPAddress;
  const headers={...req.headers,host:'image.midcode.cc','x-toonflow-local-client':'0'};
  for(const name of ['cookie','authorization','x-midcode-client-ip','x-forwarded-for','connection','upgrade'])delete headers[name];
  await proxy(req,res,`http://${address}:3000${inner}${url.search}`,headers,uid);
 }catch(error){if(!res.headersSent)reply(res,error.status>=400&&error.status<600?error.status:502,{error:error.status?error.message:'工作台暂时不可用，请稍后重试'});else res.destroy();console.error('video gateway request failed',error.status||502)}
});
server.requestTimeout=120000;server.headersTimeout=15000;
server.listen(8080,'0.0.0.0');
