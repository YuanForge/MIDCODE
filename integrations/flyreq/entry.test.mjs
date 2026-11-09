import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./entry.js', import.meta.url), 'utf8');
async function runEntry({uid=3, resumeStatus=200, resumeUid=3, finalUid=uid, fresh=true, timeout=false, fragment=''}={}) {
 const calls=[],status={},retry={hidden:true};let destination, installed; let exchanged=false;
 const token='header.'+Buffer.from(JSON.stringify({sub:uid,exp:Date.now()/1000+600})).toString('base64url')+'.signature';
 const context={URL,URLSearchParams,AbortSignal,Date,atob,location:{hash:fragment,pathname:'/studio-preview/entry',replace:url=>{destination=url}},history:{replaceState(_a,_b,url){destination=url}},document:{getElementById:id=>id==='status'?status:retry,open(){},write:html=>{installed=html},close(){}},localStorage:{getItem:key=>key==='token'?token:(fresh?String(Date.now()):null),setItem(){}},fetch:async(url,opts)=>{
  calls.push(url);assert.ok(opts.signal);if(timeout)throw Object.assign(new Error('timed out'),{name:'TimeoutError'});
  if(url.endsWith('/zh/'))return {ok:exchanged||resumeStatus===200,status:exchanged?200:resumeStatus,text:async()=>resumeStatus===200||exchanged?'<head><script>window.__MIDCODE_STUDIO__={"userId":'+(exchanged?finalUid:resumeUid)+',"prefix":"/studio-preview"};</script></head>':'<p>Sign in</p>'};
  if(url.endsWith('/handoff'))return {ok:true,json:async()=>({url:'https://image.midcode.cc/video/#midcode_code=one-time'})};
  exchanged=true; return {ok:true,json:async()=>({userId:uid})};
 }};
 await vm.runInNewContext(source,context);
 return {calls,status,retry,destination,installed};
}
test('return visit refreshes model bindings even within the previous cache window',async()=>{
 const r=await runEntry();assert.deepEqual(r.calls,['/api/user/video-studio/handoff','/studio-preview/midcode/exchange','/studio-preview/zh/']);assert.equal(r.destination,'/studio-preview/zh/');
});
test('account switch and stale model profile require fresh handoff',async()=>{
 for(const options of [{resumeUid:4},{resumeStatus:401}]){
  const r=await runEntry(options);assert.deepEqual(r.calls,['/api/user/video-studio/handoff','/studio-preview/midcode/exchange','/studio-preview/zh/']);assert.equal(r.destination,'/studio-preview/zh/');
 }
});
test('network timeout exits loading with retry instead of creating another handoff',async()=>{
 const r=await runEntry({timeout:true});assert.equal(r.installed,undefined);assert.equal(r.retry.hidden,false);assert.match(r.status.textContent,/连接超时/);assert.equal(r.calls.length,1);
});
test('explicit one-time ticket is exchanged even when a session exists',async()=>{
 const r=await runEntry({fragment:'#midcode_code=one-time'});assert.deepEqual(r.calls,['/studio-preview/midcode/exchange','/studio-preview/zh/']);assert.equal(r.destination,'/studio-preview/zh/');
});

test('stale models refresh before fetching workspace HTML', async()=>{
 const r=await runEntry({fresh:false});assert.deepEqual(r.calls,['/api/user/video-studio/handoff','/studio-preview/midcode/exchange','/studio-preview/zh/']);assert.match(r.installed,/userId/);
});

test('never installs another account document after exchange', async()=>{
 const r=await runEntry({fresh:false,finalUid:4});assert.equal(r.installed,undefined);assert.match(r.status.textContent,/账户已变更/);
});
