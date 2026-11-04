import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createGateway, registry } from './gateway.mjs';

test('registry never contains the real account key', () => {
  const value = registry([{keyId:7,name:'Key',apiKey:'PRIVATE',models:[{id:'gpt-image-2',type:'image'},{id:'sora-2',type:'video'}]}]);
  assert.equal(value.imageModels.length,1); assert.equal(value.videoModels.length,1);
  assert.ok(!JSON.stringify(value).includes('PRIVATE'));
});

test('MIDCODE video adapter translates creation and terminal task status',async()=>{
  const tenant=createRequire(import.meta.url)('./tenant.cjs');let sent;
  const api=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;res.setHeader('Content-Type','application/json');
    if(req.url==='/v1/video'||req.url==='/v1/image'){sent=JSON.parse(raw);res.writeHead(202).end('{"task_id":123}');}
    else if(req.url==='/v1/tasks/123')res.end('{"status":2,"url":"https://example.com/result.mp4"}');
    else res.writeHead(404).end('{}');});
  await new Promise(r=>api.listen(0,'127.0.0.1',r));
  try{const request={baseUrl:`http://127.0.0.1:${api.address().port}`,model:'seedance-test',prompt:'test',resolution:720,seconds:6,aspectRatio:'16:9'};
    const id=await tenant.createVideo('internal-capability',request,{images:[],videos:[],audios:[]},AbortSignal.timeout(5000));assert.equal(id,'123');
    assert.equal(sent.duration,'6');assert.equal(sent.size,'720p');assert.equal(sent.aspect_ratio,'16:9');
    const result=await tenant.pollVideo('internal-capability',request,id,AbortSignal.timeout(5000));assert.equal(result.remoteUrl,'https://example.com/result.mp4');
    const image=await tenant.generateImage('internal-capability',{...request,outputSize:'1K',images:[]});assert.equal(image.image,'URL:https://example.com/result.mp4');assert.equal(sent.size,'1k');assert.equal(sent.n,1);
  }finally{api.closeAllConnections();await new Promise(r=>api.close(r));}
});

test('isolated tenants, fixed upstream, origin checks and one-time login', {skip:!process.env.FLYREQ_TEST_ROOT}, async () => {
  const used = new Set(), calls = [];
  const main = http.createServer(async(req,res)=>{
    let raw='';for await(const c of req)raw+=c;
    res.setHeader('Content-Type','application/json');
    if(req.url.includes('/video-studio/')){
      const {token}=JSON.parse(raw),uid=token[0]==='a'?101:102;
      if(req.url.endsWith('/redeem')){
        if(used.has(token)){res.writeHead(401).end('{}');return;}used.add(token);
        res.end(JSON.stringify({userId:uid,session:token,profiles:[{keyId:uid,name:'MIDCODE',apiKey:`private-${uid}`,models:[{id:'gpt-image-2',type:'image'}]}]}));return;
      }
      res.end(JSON.stringify({userId:uid}));return;
    }
    calls.push({url:req.url,auth:req.headers.authorization});
    if(req.url==='/v1/models'){res.end('{"data":[{"id":"gpt-image-2"}]}');return;}
    res.writeHead(502).end('{"error":{"message":"intentional test upstream failure"}}');
  });
  await new Promise(r=>main.listen(0,'127.0.0.1',r));
  const state=await mkdtemp(join(tmpdir(),'midcode-gateway-test-'));
  const origin='http://127.0.0.1:18195';
  const gateway=await createGateway({TOONFLOW_HANDOFF_SECRET:'s'.repeat(40),MIDCODE_BACKEND:`http://127.0.0.1:${main.address().port}`,MIDCODE_PUBLIC_ORIGIN:origin,MIDCODE_STATE:state,PORT:'18195',FLYREQ_ROOT:process.env.FLYREQ_TEST_ROOT});
  await new Promise(r=>gateway.listen(18195,'127.0.0.1',r));
  /** 发送候选接口请求；输入路径、身份和载荷，返回 Response。 */
  const request=(path,cookie,body,extra={})=>fetch(origin+'/studio-preview'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  try {
    assert.equal((await request('/api/flyreq/config')).status,401);
    const a=await request('/midcode/exchange',null,{code:'a'.repeat(64)}),b=await request('/midcode/exchange',null,{code:'b'.repeat(64)});
    assert.equal(a.status,200);assert.equal(b.status,200);
    const ca=a.headers.get('set-cookie').split(';')[0],cb=b.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/midcode/exchange',null,{code:'a'.repeat(64)})).status,401);
    assert.equal((await request('/api/flyreq/proxy/models',ca,{apiKey:'midcode-101',baseUrl:'http://malicious.invalid',protocol:'google'})).status,200);
    assert.deepEqual(calls[0],{url:'/v1/models',auth:'Bearer private-101'});
    assert.equal((await request('/api/flyreq/proxy/models',cb,{apiKey:'midcode-101',baseUrl:origin})).status,502);
    assert.equal((await request('/api/flyreq/proxy/models',ca,{apiKey:'midcode-101'},{Origin:'https://evil.invalid'})).status,403);
    assert.equal((await request('/api/flyreq/proxy/models?apiKey=x',ca)).status,405);
    const create=await request('/api/flyreq/tasks',ca,{apiKey:'midcode-101',baseUrl:'http://evil.invalid',protocol:'openai',mode:'text-to-image',model:'gpt-image-2',prompt:'isolation test',parallelCount:1,outputSize:'1K',aspectRatio:'1:1'});
    assert.equal(create.status,202);const {taskId}=await create.json();
    assert.equal((await request('/api/flyreq/tasks/'+taskId,ca)).status,200);
    assert.equal((await request('/api/flyreq/tasks/'+taskId,cb)).status,404);
    const {WebSocket}=createRequire(join(process.env.FLYREQ_TEST_ROOT,'backend/package.json'))('ws');
    const message=await new Promise((resolve,reject)=>{
      const socket=new WebSocket(origin.replace('http:','ws:')+'/studio-preview/api/flyreq/ws',{headers:{Origin:origin,Cookie:cb}});
      const timeout=setTimeout(()=>{socket.terminate();reject(new Error('WebSocket timeout'));},5000);
      socket.on('open',()=>socket.send(JSON.stringify({type:'subscribeTasks',taskIds:[taskId]})));
      socket.on('message',raw=>{clearTimeout(timeout);socket.close();resolve(JSON.parse(raw.toString()));});
      socket.on('error',reject);
    });
    assert.equal(message.task.status,'expired');
    const html=await(await request('/zh/',ca)).text();assert.ok(html.includes('__MIDCODE_STUDIO__'));assert.ok(!html.includes('private-101'));
    assert.equal((await fetch(origin+'/_upstream/101/101/v1/models')).status,403);
  } finally {gateway.closeAllConnections();await new Promise(r=>gateway.close(r));main.closeAllConnections();await new Promise(r=>main.close(r));await new Promise(r=>setTimeout(r,300));await rm(state,{recursive:true,force:true});}
});
