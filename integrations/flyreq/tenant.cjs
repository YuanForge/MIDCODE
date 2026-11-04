const { createHash, createHmac } = require('node:crypto');
const fs = require('node:fs');
/** 锁定请求到服务端批准的密钥及模型；输入表单或 JSON，返回固定上游配置。 */
exports.lock = function lock(body) {
  const profiles = JSON.parse(fs.readFileSync(process.env.MIDCODE_TENANT_FILE, 'utf8'));
  const profile = profiles.find(p => `midcode-${p.keyId}` === body.apiKey);
  if (!profile) throw new Error('请从 MIDCODE 重新进入工作台');
  const model = body.model || body.requestBody?.model;
  if (model && !profile.models.some(m => m.id === model)) throw new Error('该密钥未绑定此模型');
  if (body.requestBody?.model && !profile.models.some(m => m.id === body.requestBody.model)) throw new Error('该密钥未绑定此模型');
  body.baseUrl = `${process.env.MIDCODE_GATEWAY}/_upstream/${process.env.MIDCODE_USER_ID}/${profile.keyId}`;
  body.apiKey = profile.capability;
  body.protocol = 'openai';
  body.streamImages = false;
  return body;
};
let storage;
/** 判断该密钥的模型是否走 MIDCODE 异步图片渠道；输入内部凭证和模型，返回布尔值。 */
exports.isAsyncImage = function isAsyncImage(apiKey,model) {
  const profiles=JSON.parse(fs.readFileSync(process.env.MIDCODE_TENANT_FILE,'utf8'));
  return profiles.find(p=>p.capability===apiKey)?.models.some(m=>m.id===model&&m.type==='image')||false;
};
/** 通过平台图片任务生成并轮询；输入凭证和图片参数，返回原生工作台可处理的图片结果。 */
exports.generateImage = async function generateImage(apiKey,request) {
  const signal=AbortSignal.timeout(1800000);
  let size=String(request.outputSize||'1k').toLowerCase();if(!['1k','2k','4k'].includes(size))size='1k';
  const payload={model:request.model,prompt:request.prompt,size,aspect_ratio:request.aspectRatio==='auto'?'1:1':request.aspectRatio,n:1,refer_images:await Promise.all((request.images||[]).map(image=>reference({buffer:Buffer.from(image.data,'base64'),mimeType:image.mimeType||'image/png'})))};
  const r=await fetch(request.baseUrl+'/v1/image',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
  const data=await r.json();if(!r.ok||!data.task_id)throw new Error(data.error||data.msg||'图片任务创建失败');
  const result=await exports.pollVideo(apiKey,request,String(data.task_id),signal);
  return {image:'URL:'+result.remoteUrl,usesSse:false};
};
/** 将参考素材写入账号的对象存储；输入二进制和 MIME，返回稳定 URL。 */
async function reference(file) {
  const {createMediaStore}=await import('../integrations/media-storage/store.mjs');
  storage ||= createMediaStore();
  if(!storage)throw new Error('素材存储未配置');
  const type=file.mimeType||'image/png';
  const key=`${type.startsWith('image/')?'image':'video'}/unified/${process.env.MIDCODE_USER_ID}/${createHash('sha256').update(file.buffer).digest('hex')}`;
  await storage.put(key,file.buffer,type);
  return mediaURL(key);
}
/** 签发素材能力链接；输入对象键，返回只读链接。 */
function mediaURL(key) {
  const value=Buffer.from(JSON.stringify({key})).toString('base64url');
  const signature=createHmac('sha256',process.env.MIDCODE_MEDIA_SECRET).update(value).digest('base64url');
  return `${process.env.MIDCODE_PUBLIC_ORIGIN}${process.env.MIDCODE_PREFIX}/media/${value}.${signature}`;
}
/** 通过 MIDCODE 异步视频接口提交；输入内部鉴权、参数及附件，返回任务 ID。 */
exports.createVideo = async function createVideo(apiKey,request,files,signal) {
  const payload={model:request.model,prompt:request.prompt,size:`${request.resolution}p`,aspect_ratio:request.aspectRatio,duration:String(request.seconds),refer_images:await Promise.all((files.images||[]).map(reference)),refer_videos:await Promise.all((files.videos||[]).map(reference)),refer_audios:await Promise.all((files.audios||[]).map(reference))};
  const r=await fetch(request.baseUrl+'/v1/video',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
  const data=await r.json();
  if(!r.ok||!data.task_id)throw new Error(data.error||data.msg||'视频任务创建失败');
  return String(data.task_id);
};
/** 轮询 MIDCODE 任务终态；输入内部鉴权、参数、任务 ID，返回最终素材地址。 */
exports.pollVideo = async function pollVideo(apiKey,request,taskId,signal) {
  if(!/^\d+$/.test(taskId))throw new Error('视频任务编号无效');
  while(true){
    signal.throwIfAborted();
    const r=await fetch(request.baseUrl+'/v1/tasks/'+taskId,{headers:{Authorization:`Bearer ${apiKey}`},signal});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'视频任务查询失败');
    if(data.status===2&&data.url)return {remoteUrl:data.url,authenticatedOrigin:new URL(request.baseUrl).origin};
    if(data.status===3)throw new Error(data.msg||'视频生成失败');
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
};
/** 将完整结果归档到 S3；输入文件和 MIME，返回不含存储密钥的稳定素材链接。 */
exports.archive = async function archive(file, type) {
  const { createMediaStore } = await import('../integrations/media-storage/store.mjs');
  storage ||= createMediaStore();
  if (!storage) throw new Error('素材存储未配置');
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  const key = `${type.startsWith('video/') ? 'video' : 'image'}/unified/${process.env.MIDCODE_USER_ID}/${hash.digest('hex')}`;
  await storage.putStream(key, fs.createReadStream(file), type);
  return mediaURL(key);
};
