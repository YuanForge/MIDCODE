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
 const {data,loading,error,reload}=useAsync(()=>api.get<{qq:string;verified:boolean}>('/user/qq-binding'),{qq:'',verified:false})
 const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState(''),[confirm,setConfirm]=useState(false)
 async function save(remove=false){
 if(busy)return
 const qq=input.trim();if(!remove&&!/^[1-9][0-9]{4,19}$/.test(qq)){setFailure('请输入5至20位数字QQ号，不能以0开头');return}
 setBusy(true);setFailure('');setMessage('')
 try{if(remove)await api.delete('/user/qq-binding');else await api.put('/user/qq-binding',{qq});setInput('');setConfirm(false);setMessage(remove?'QQ已解绑':'QQ绑定已保存');reload()}
 catch(err){setFailure(getApiErrorMessage(err))}finally{setBusy(false)}
 }
 return <PageSection title="绑定 QQ" description="绑定后可通过机器人按 QQ 号查询余额和消费。每个 QQ 只能绑定一个账号；目前不验证 QQ 所有权，请填写本人 QQ。">
 <div className="flex flex-col gap-3">
 {loading?<p role="status">正在加载QQ绑定…</p>:error?<Alert variant="destructive"><AlertDescription>{error}<Button onClick={reload}>重试</Button></AlertDescription></Alert>:<>
 <p>当前 QQ：<strong>{data.qq||'未绑定'}</strong>{data.qq?'（未验证）':''}</p>
 <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void save()}}>
 <label htmlFor="qq-number" className="flex min-w-0 flex-1 flex-col gap-2">{data.qq?'新 QQ 号':'QQ 号'}<Input id="qq-number" inputMode="numeric" autoComplete="off" maxLength={20} value={input} onChange={e=>setInput(e.target.value)} placeholder="请输入本人QQ号" disabled={busy}/></label>
 <Button type="submit" disabled={busy||!input.trim()}>{busy?'处理中…':data.qq?'修改绑定':'绑定 QQ'}</Button>
 {data.qq?<Button type="button" variant="outline" disabled={busy} onClick={()=>{setFailure('');setConfirm(true)}}>解绑 QQ</Button>:null}
 </form></>}
 {failure?<Alert variant="destructive"><AlertDescription>{failure}</AlertDescription></Alert>:null}{message?<p role="status">{message}</p>:null}
 </div>
 <Dialog open={confirm} onOpenChange={open=>{if(!busy)setConfirm(open)}}><DialogContent><DialogHeader><DialogTitle>解绑 QQ？</DialogTitle><DialogDescription>解绑后，机器人无法再通过这个 QQ 查询你的账号。</DialogDescription></DialogHeader>{failure?<p role="alert">{failure}</p>:null}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>取消</Button><Button variant="destructive" disabled={busy} onClick={()=>void save(true)}>确认解绑</Button></DialogFooter></DialogContent></Dialog>
 </PageSection>
}
