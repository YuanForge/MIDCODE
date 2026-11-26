import { useState } from 'react'
import { PageSection } from '@/components/shared/PageSection'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useAsync } from '@/hooks/use-async'
import { createHttpClient, getApiErrorMessage } from '@/lib/api/http'
const api = createHttpClient('user')
export function QQBindingCard() {
 const {data,loading,error,reload}=useAsync(()=>api.get<{qq:string;verified:boolean;status?:string}>('/user/qq-binding'),{qq:'',verified:false})
 const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState(''),[confirm,setConfirm]=useState(false)
 async function save(remove=false){
 if(busy)return
 const qq=input.trim();if(!remove&&!/^[1-9][0-9]{4,19}$/.test(qq)){setFailure('请输入5至20位数字QQ号，不能以0开头');return}
 setBusy(true);setFailure('');setMessage('')
 try{if(remove)await api.delete('/user/qq-binding');else await api.put('/user/qq-binding',{qq});setInput('');setConfirm(false);setMessage(remove?'QQ已解绑':'申请已提交，请在15分钟内到群767281836发送 @机器人 绑定');reload()}
 catch(err){setFailure(getApiErrorMessage(err))}finally{setBusy(false)}
 }
 return <PageSection title="绑定 QQ" description="填写 QQ 后，请在15分钟内到群 767281836 发送「@机器人 绑定」完成验证。绑定后在同一群发送「@机器人 查询」查看余额和消费。">
 <div className="flex flex-col gap-3">
 {loading?<p role="status">正在加载QQ绑定…</p>:error?<Alert variant="destructive"><AlertDescription>{error}<Button onClick={reload}>重试</Button></AlertDescription></Alert>:<>
 <p>当前 QQ：<strong>{data.qq||'未绑定'}</strong>{data.qq?(data.verified?'（已绑定）':data.status==='expired'?'（申请已过期，请重新提交）':'（待群内验证）'):''}</p>
 <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void save()}}>
 <label htmlFor="qq-number" className="flex min-w-0 flex-1 flex-col gap-2">{data.qq?'新 QQ 号':'QQ 号'}<Input id="qq-number" inputMode="numeric" autoComplete="off" maxLength={20} value={input} onChange={e=>setInput(e.target.value)} placeholder="请输入本人QQ号" disabled={busy}/></label>
 <Button type="submit" disabled={busy||!input.trim()}>{busy?'处理中…':data.qq?'重新提交绑定':'提交绑定申请'}</Button>
 {data.qq?<Button type="button" variant="outline" disabled={busy} onClick={()=>{setFailure('');setConfirm(true)}}>解绑 QQ</Button>:null}
 </form><Button variant="outline" disabled={busy} onClick={reload}>刷新绑定状态</Button></>}
 {failure?<Alert variant="destructive"><AlertDescription>{failure}</AlertDescription></Alert>:null}{message?<p role="status">{message}</p>:null}
 </div>
 <Dialog open={confirm} onOpenChange={open=>{if(!busy)setConfirm(open)}}><DialogContent><DialogHeader><DialogTitle>解绑 QQ？</DialogTitle><DialogDescription>解绑后，机器人无法再通过这个 QQ 查询你的账号。</DialogDescription></DialogHeader>{failure?<p role="alert">{failure}</p>:null}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>取消</Button><Button variant="destructive" disabled={busy} onClick={()=>void save(true)}>确认解绑</Button></DialogFooter></DialogContent></Dialog>
 </PageSection>
}
